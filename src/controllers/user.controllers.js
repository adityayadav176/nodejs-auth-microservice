import { uploadOnCloudinary } from "../utils/cloudinary.js"
import { transporter } from "../utils/nodemailer.js"
import { PROJECT_NAME } from "../constant/constant.js"
import { User } from "../models/user.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import bcrypt from "bcrypt"
import cloudinary from "cloudinary"
import { OAuth2Client } from "google-auth-library"
import crypto from "crypto";
import axios, { AxiosError } from "axios";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import JWT from "jsonwebtoken"
import { UAParser } from "ua-parser-js"
import { Session } from "../models/session.model.js"

const generateAccessAndRefreshToken = async (userId) => {
    const user = await User.findById(userId);

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;

    await user.save({
        validateBeforeSave: false
    });

    return {
        accessToken,
        refreshToken
    };
};

const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID
)

const registerUser = asyncHandler(async (req, res) => {
    const { name, email, password, phoneNo } = req.body || {}

    if ([name, email, password, phoneNo].some(field => !field?.toString().trim())) {
        throw new ApiError(400, "All Filed Are Required");
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existedUser = await User.findOne({
        $or: [{ phoneNo }, { email: normalizedEmail }]
    });

    if (existedUser) {
        throw new ApiError(400, "User Already Exists");
    }

    const avatarLocalPath = req.files?.avatar?.[0]?.path
    const coverImageLocalPath = req.files?.coverImage?.[0]?.path

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar File Required");
    }

    if (!coverImageLocalPath) {
        throw new ApiError(400, "CoverImage Required");
    }

    const uploadAvatar = await uploadOnCloudinary(avatarLocalPath);
    if (!uploadAvatar?.secure_url || !uploadAvatar?.public_id) {
        throw new ApiError(500, "Failed To Upload Avatar");
    }

    const uploadCoverImage = await uploadOnCloudinary(coverImageLocalPath);

    if (!uploadCoverImage?.secure_url || !uploadCoverImage?.public_id) {
        throw new ApiError(500, "Failed To Upload CoverImage");
    }

    const user = await User.create({
        name,
        email: normalizedEmail,
        phoneNo,
        password,
        avatar: {
            url: uploadAvatar?.secure_url,
            public_id: uploadAvatar?.public_id
        },
        coverImage: {
            url: uploadCoverImage?.secure_url,
            public_id: uploadCoverImage?.public_id
        }
    })

    if (!user) {
        throw new ApiError(500, "Something Went Wrong While Register User");
    }

    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({
        validateBeforeSave: false
    });

    try {
        await transporter.sendMail({
            from: process.env.SENDER_EMAIL,
            to: email,
            subject: `Welcome To Our Application ${PROJECT_NAME}`,
            html: `
            <h1>Hi ${name}</h1>
            <h2>Your Account Is Successfully Created On ${PROJECT_NAME}</h2>
        `
        });
    } catch (error) {
        console.error("Email Error:", error);
    }

    const createdUser = await User.findById(user._id).select("-password -refreshToken");

    if (!createdUser) {
        throw new ApiError(404, "User Not Found!");
    }

    return res.status(201).json(
        new ApiResponse(201,
            {
                user: createdUser,
                refreshToken,
                accessToken
            },
            "Register User Successfully")
    )
})

const loginUser = asyncHandler(async (req, res) => {
    const { email, phoneNo, password } = req.body;
    const ipAddress = req.ip;

    console.log(req.deviceInfo);


    if ((!email && !phoneNo) || !password) {
        throw new ApiError(400, "All Fileds Are Required");
    }

    const normalizedEmail = email?.toLowerCase().trim();

    const user = await User.findOne({
        $or: [{ email: normalizedEmail }, { phoneNo }]
    })

    if (!user) {
        throw new ApiError(404, "User Not Found");
    }

    if (!user.password) {
        throw new ApiError(
            400,
            "This account was created using Google. Please login with Google or set a password."
        );
    }

    const remainingMinutes = Math.ceil((user.lockUntil - Date.now()) / (1000 * 60));

    if (user.lockUntil && user.lockUntil > Date.now()) {
        throw new ApiError(403, `Account locked. Try again in ${remainingMinutes} minute(s).`)
    }

    const isPasswordCorrect = await user.isPasswordCorrect(password);

    if (!isPasswordCorrect) {

        user.failedLoginAttempts += 1;

        if (user.failedLoginAttempts >= 5) {
            user.lockUntil = Date.now() + 15 * 60 * 1000;
        }

        await user.save({
            validateBeforeSave: false
        });

        throw new ApiError(400, "Invalid Credintials");
    }

    if (user.twoFactorEnabled) {
        return res.status(200)
            .json(
                new ApiResponse({
                    twoFactorRequired: true,
                    userId: user._id
                })
            )
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(user._id);

    const cookieOption = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
    };

    user.failedLoginAttempts = 0;
    user.lockUntil = null;

    await user.save({
        validateBeforeSave: false
    });

    const { browser, os, device } = req.deviceInfo;

    const hashedRefreshToken =
    crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");

    const session = await Session.create({
        userId: user._id,
        refreshToken: hashedRefreshToken,

        deviceModel: device.model || "",
        device: device.name || "",
        deviceType: device.type || "desktop",
        deviceVendor: device.vendor || "",

        browser: browser.name || "Unknown",
        browserVersion: browser.version || "",

        os: os.name || "Unknown",
        osVersion: os.version || "",

        ipAddress,

        userAgent: req.headers["user-agent"] || "",
    });

    const safeSession = {
        _id: session._id,
        deviceName: session.device,
        deviceModel: session.deviceModel,
        deviceType: session.deviceType,
        deviceVendor: session.deviceVendor,
        browser: session.browser,
        os: session.os,
        osVersion: session.osVersion,
        lastActive: session.lastActive
    }

    const loggedInUser = await User.findById(user._id)
        .select(
            "-password -refreshToken -forgetPasswordOtp -passwordResetToken -deleteAccountOtp -emailVerificationOTP"
        );

    return res.status(200)
        .cookie("accessToken", accessToken, cookieOption)
        .cookie("refreshToken", refreshToken, cookieOption)
        .json(
            new ApiResponse(
                200,
                {
                    user: loggedInUser,
                    session: safeSession,
                    accessToken
                },
                "User Login OR Seesion Created Successfully"
            )
        );
})

const logoutUser = asyncHandler(async (req, res) => {
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    const user = await User.findOneAndUpdate(
        { _id: userId },
        {
            $unset: {
                refreshToken: 1
            }
        },
        {
            returnDocument: "after"
        }
    );

    if (!user) {
        throw new ApiError(404, "User Not Found");
    }

    const cookieOption = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
    };

    return res
        .status(200)
        .clearCookie("accessToken", cookieOption)
        .clearCookie("refreshToken", cookieOption)
        .json(
            new ApiResponse(200, {}, "User Logged Out Successfully")
        )
})

const verifyAccount = asyncHandler(async (req, res) => {
    const { otp } = req.body;

    if (!otp) {
        throw new ApiError(400, "Otp required For Verificaition");
    }

    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    const user = await User.findById(userId);

    if (!user) {
        throw new ApiError(404, "User not Found");
    }

    if (user.emailVerificationOTPExpiry < Date.now()) {
        throw new ApiError(409, "Otp Already Expired");
    }

    const isOtpValid = bcrypt.compare(otp, user.emailVerificationOTP);

    if (!isOtpValid) {
        throw new ApiError(400, "Invalid Otp");
    }

    user.isVerified = true
    user.emailVerificationOTP = undefined;
    user.emailVerificationOTPExpiry = undefined;

    await user.save({ validateBeforeSave: false });

    return res.status(200)
        .json(
            new ApiResponse(200, {}, "Hurry! Your Email Is Now Verified")
        )
})

const sendVerifyAccountOtp = asyncHandler(async (req, res) => {
    const userId = req.user._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized Access Denied!");
    }

    const user = await User.findById(userId);

    if (!user) {
        throw new ApiError(404, "User Not Found");
    }

    if (user.isVerified) {
        throw new ApiError(400, "User Already Verifed");
    }

    if (user.emailVerificationOTPExpiry && user.emailVerificationOTPExpiry > Date.now()) {
        throw new ApiError(429, "Please Wait Before requesting Another Otp");
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const hashedOtp = await bcrypt.hash(otp, 10);

    user.emailVerificationOTP = hashedOtp;
    user.emailVerificationOTPExpiry = Date.now() + 2 * 60 * 1000;

    await user.save({ validateBeforeSave: false });

    try {
        await transporter.sendMail({
            from: process.env.SENDER_EMAIL,
            to: user.email,
            subject: "Email Verification Otp",
            html: `
         <h2>Email Verification</h2>
         <p>Your OTP is:</p>
         <h1>${otp}</h1>
         <p>Valid for 2 minutes.</p>
     `
        })

    } catch (error) {
        user.emailVerificationOTP = undefined;
        user.emailVerificationOTPExpiry = undefined;
        await user.save({ validateBeforeSave: false });

        throw new ApiError(500, "Failed To Send OTP For EmailVerification");
    }
    return res.status(200)
        .json(
            new ApiResponse(200, {}, "Otp Send To Email Successfully")
        )
})

const forgetPassword = asyncHandler(async (req, res) => {
    const { password, otp, resetToken } = req.body;
    if (!password || !otp || !resetToken) {
        throw new ApiError(
            400,
            "Reset Token, Password And OTP Are Required"
        );
    }

    const hashedToken = crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");

    const user = await User.findOne({
        passwordResetToken: hashedToken,
        passwordResetTokenExpiresAt: {
            $gt: Date.now()
        }
    });

    if (!user) {
        throw new ApiError(
            400,
            "Invalid Or Expired Reset Token"
        );
    }

    if (!user.forgetPasswordOtp || !user.forgetPasswordOtpExpiredAt) {
        throw new ApiError(
            400,
            "Request OTP First"
        );
    }

    if (user.forgetPasswordOtpExpiredAt < Date.now()) {
        throw new ApiError(
            400,
            "OTP Expired"
        );
    }

    const isOtpValid = await bcrypt.compare(otp, user.forgetPasswordOtp);

    if (!isOtpValid) {
        throw new ApiError(
            400,
            "Invalid OTP"
        );
    }

    user.password = password;

    user.forgetPasswordOtp = undefined;
    user.forgetPasswordOtpExpiredAt = undefined;

    user.passwordResetToken = undefined;
    user.passwordResetTokenExpiresAt =
        undefined;

    await user.save({
        validateBeforeSave: false
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            {},
            "Password Updated Successfully"
        )
    );
});

const sendForgetPasswordOtp = asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
        throw new ApiError(400, "Email Required");
    }

    const user = await User.findOne({ email });

    if (!user) {
        throw new ApiError(404, "Account Not Found");
    }

    if (
        user.forgetPasswordOtpExpiredAt &&
        user.forgetPasswordOtpExpiredAt > Date.now()
    ) {
        throw new ApiError(
            429,
            "Please Wait Before Requesting Another OTP"
        );
    }

    const otp = Math.floor(
        100000 + Math.random() * 900000
    ).toString();

    const hashedOtp = await bcrypt.hash(otp, 10);

    const resetToken = crypto
        .randomBytes(32)
        .toString("hex");

    user.passwordResetToken = crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");

    user.passwordResetTokenExpiresAt =
        Date.now() + 10 * 60 * 1000;

    user.forgetPasswordOtp = hashedOtp;
    user.forgetPasswordOtpExpiredAt =
        Date.now() + 2 * 60 * 1000;

    await user.save({
        validateBeforeSave: false
    });

    try {
        await transporter.sendMail({
            from: process.env.SENDER_EMAIL,
            to: email,
            subject: "Password Reset OTP",
            html: `
            <h2>Reset Your Password</h2>
            <p>Your OTP is:</p>
            <h1>${otp}</h1>
            <p>Valid for 2 minutes.</p>
        `
        });
    } catch (error) {
        user.forgetPasswordOtp = undefined;
        user.forgetPasswordOtpExpiredAt = undefined;
        user.passwordResetToken = undefined;
        user.passwordResetTokenExpiresAt = undefined;

        await user.save({
            validateBeforeSave: false
        });

        throw new ApiError(
            500,
            "Failed To Send OTP"
        );
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            { resetToken },
            "Password Reset OTP Sent Successfully"
        )
    );
});

const updateCoverImage = asyncHandler(async (req, res) => {
    const coverImageLocalPath = req.file?.path;

    if (!coverImageLocalPath) {
        throw new ApiError(400, "Avatar File Required");
    }

    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    const user = await User.findById(userId);

    if (!user) {
        throw new ApiError(404, "User Not Found");
    }

    // delete old avatar
    if (user.coverImage?.public_id) {
        await cloudinary.uploader.destroy(user.coverImage.public_id);
    }

    const uploadCoverImage = await uploadOnCloudinary(coverImageLocalPath);

    if (!uploadCoverImage?.secure_url || !uploadCoverImage?.public_id) {
        throw new ApiError(500, "Failed To Upload Avatar");
    }

    user.coverImage = {
        url: uploadCoverImage.secure_url,
        public_id: uploadCoverImage.public_id
    };

    await user.save({ validateBeforeSave: false });

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                coverImage: user.coverImage
            },
            "CoverImage Updated Successfully"
        )
    );
})

const updateAvatar = asyncHandler(async (req, res) => {
    const avatarLocalPath = req.file?.path;

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar File Required");
    }

    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    const user = await User.findById(userId);

    if (!user) {
        throw new ApiError(404, "User Not Found");
    }

    // delete old avatar
    if (user.avatar?.public_id) {
        await cloudinary.uploader.destroy(user.avatar.public_id);
    }

    const uploadAvatar = await uploadOnCloudinary(avatarLocalPath);

    if (!uploadAvatar?.secure_url || !uploadAvatar?.public_id) {
        throw new ApiError(500, "Failed To Upload Avatar");
    }

    user.avatar = {
        url: uploadAvatar.secure_url,
        public_id: uploadAvatar.public_id
    };

    await user.save({ validateBeforeSave: false });

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                avatar: user.avatar
            },
            "Avatar Updated Successfully"
        )
    );
});

const sendDeleteAccountOtp = asyncHandler(async (req, res) => {
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    const user = await User.findById(userId);

    if (!user) {
        throw new ApiError(404, "User Not Found");
    }

    if (user.deleteAccountOtpExpiredAt && user.deleteAccountOtpExpiredAt > Date.now()) {
        throw new ApiError(429, "Please wait before requesting another OTP")
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const hashedOtp = await bcrypt.hash(otp, 10);
    user.deleteAccountOtp = hashedOtp;
    user.deleteAccountOtpExpiredAt = Date.now() + 2 * 60 * 1000;
    await user.save({ validateBeforeSave: false });

    try {
        await transporter.sendMail({
            from: process.env.SENDER_EMAIL,
            to: user.email,
            subject: "Delete Account OTP",
            html: `
              <h2>Account Deletion Verification</h2>
              <p>Use the OTP below to permanently delete your account.</p>
              <h1>${otp}</h1>
              <p>Valid for 2 minutes.</p>
          `
        })
    } catch (error) {
        user.deleteAccountOtp = undefined;
        user.deleteAccountOtpExpiredAt = undefined,
            await user.save({ validateBeforeSave: false })
        throw new ApiError(500, "Failed To Send OTP");
    }

    return res.status(200)
        .json(
            new ApiResponse(200, {}, "OTP Send To Your Email Successfully")
        )
})

const deleteAccount = asyncHandler(async (req, res) => {
    const userId = req.user._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    const user = await User.findById(userId);

    if (!user) {
        throw new ApiError(404, "User Not Found");
    }

    const { password, otp } = req.body

    if (!password || !otp) {
        throw new ApiError(400, "Password and OTP are required");
    }

    if (user.deleteAccountOtpExpiredAt < Date.now()) {
        throw new ApiError(400, "Otp Expired")
    }

    const isOtpValid = await bcrypt.compare(otp, user.deleteAccountOtp);

    if (!isOtpValid) {
        throw new ApiError(400, "Invalid Otp");
    }

    const isPasswordCorrect = await user.isPasswordCorrect(password)

    if (!isPasswordCorrect) {
        throw new ApiError(400, "Invalid Password");
    }

    user.deleteAccountOtp = undefined,
        user.deleteAccountOtpExpiredAt = undefined,
        await user.save({ validateBeforeSave: false });

    await User.findByIdAndDelete(userId);

    const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
    };

    return res.status(200)
        .clearCookie("accessToken", cookieOptions)
        .clearCookie("refreshToken", cookieOptions)
        .json(
            new ApiResponse(200, {}, "Account Deleted Successfully")
        )
})

const changeName = asyncHandler(async (req, res) => {
    const { name } = req.body;

    if (!name || !name.trim()) {
        throw new ApiError(400, "Name is required");
    }

    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    const user = await User.findById(userId);

    if (!user) {
        throw new ApiError(404, "User Not Found");
    }

    user.name = name.trim();

    await user.save({ validateBeforeSave: false });

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                _id: user._id,
                name: user.name,
                email: user.email
            },
            "Name updated successfully"
        )
    );
});

const fetchUser = asyncHandler(async (req, res) => {
    const userId = req.user._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    const user = await User.findById(userId).select("-password -refreshToken")

    return res.status(200)
        .json(
            new ApiResponse(200, user, "Fethed User Successfully")
        )
})

const googleAuth = asyncHandler(async (req, res) => {
    const { credential } = req.body;

    if (!credential) {
        throw new ApiError(
            400,
            "Google credential is required"
        );
    }

    const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();

    if (!payload?.email) {
        throw new ApiError(400, "Invalid Google Token");
    }

    const { sub: googleId, email, name, picture } = payload;

    let user = await User.findOne({
        $or: [
            { googleId },
            { email }
        ]
    });

    if (!user) {
        user = await User.create({
            googleId,
            name,
            email,
            avatar: {
                url: picture || "",
                public_id: ""
            },
            isVerified: true
        });
    }

    else if (!user.googleId) {
        user.googleId = googleId;

        if (!user.avatar?.url && picture) {
            user.avatar = {
                url: picture,
                public_id: ""
            };
        }

        user.isVerified = true;

        await user.save();
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(user._id);

    user.refreshToken = refreshToken;

    await user.save({ validateBeforeSave: false });

    const option = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax"
    };

    return res.status(200)
        .cookie("accessToken", accessToken, option)
        .cookie("refreshToken", refreshToken, option)
        .json(
            new ApiResponse(
                200,
                {
                    user: {
                        _id: user._id,
                        name: user.name,
                        email: user.email,
                        avatar: user.avatar?.url,
                        role: user.role
                    },
                    accessToken
                },
                "Google Login Successful"
            )
        )
})

const githubCallback = asyncHandler(async (req, res) => {
    const { code } = req.query;

    if (!code) {
        throw new ApiError(400, "Authorization code is required");
    }

    // Exchange code for GitHub access token
    const tokenResponse = await axios.post(
        "https://github.com/login/oauth/access_token",
        {
            client_id: process.env.GITHUB_CLIENT_ID,
            client_secret: process.env.GITHUB_CLIENT_SECRET,
            code
        },
        {
            headers: {
                Accept: "application/json"
            }
        }
    );

    const accessTokenGithub = tokenResponse.data?.access_token;

    if (!accessTokenGithub) {
        throw new ApiError(400, "Failed to get GitHub access token");
    }

    // Get GitHub user
    const { data: githubUser } = await axios.get(
        "https://api.github.com/user",
        {
            headers: {
                Authorization: `Bearer ${accessTokenGithub}`
            }
        }
    );

    // Get emails
    const { data: emails } = await axios.get(
        "https://api.github.com/user/emails",
        {
            headers: {
                Authorization: `Bearer ${accessTokenGithub}`
            }
        }
    );

    const primaryEmail = emails.find(e => e.primary);

    if (!primaryEmail) {
        throw new ApiError(400, "Primary email not found");
    }

    const githubId = githubUser.id.toString();

    let user = await User.findOne({
        $or: [{ githubId }, { email: primaryEmail.email }]
    });

    if (!user) {
        user = await User.create({
            githubId,
            name: githubUser.name || githubUser.login,
            email: primaryEmail.email,
            avatar: {
                url: githubUser.avatar_url || "",
                public_id: ""
            },
            isVerified: true
        });
    } else if (!user.githubId) {
        user.githubId = githubId;
        user.isVerified = true;
        await user.save();
    }

    const { accessToken, refreshToken } =
        await generateAccessAndRefreshToken(user._id);

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    const option = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax"
    };

    return res.status(200)
        .cookie("accessToken", accessToken, option)
        .cookie("refreshToken", refreshToken, option)
        .json(
            new ApiResponse(
                200,
                {
                    data: {
                        accessToken,
                        user: {
                            id: user._id,
                            name: user.name,
                            email: user.email
                        }
                    }
                },
                "GitHub OAuth successfull"
            )
        )
});

const enable2FA = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);

    if (!user) {
        throw new ApiError(404, "User Not Found");
    }

    // prevent accidental overwrite
    if (user.twoFactorEnabled && user.twoFactorSecret) {
        return res.status(400).json(
            new ApiResponse(
                400,
                {},
                "2FA already enabled"
            )
        );
    }

    // generate secret
    const secret = speakeasy.generateSecret({
        name: user.email,
        issuer: "MyApp"
    });

    // store ONLY base32 secret
    user.twoFactorSecret = secret.base32;
    user.twoFactorEnabled = false;
    await user.save();

    // build proper otpauth URL
    const otpauthURL = speakeasy.otpauthURL({
        secret: secret.base32,
        label: user.email,
        issuer: "MyApp",
        encoding: "base32"
    });

    const qrCodeUrl = await QRCode.toDataURL(otpauthURL);

    return res.status(201).json(
        new ApiResponse(
            201,
            {
                qrCodeUrl,
                secret: secret.base32
            },
            "Scan QR code in Authenticator App"
        )
    );
});

const verify2FASetup = asyncHandler(async (req, res) => {
    const { token } = req.body;

    const user = await User.findById(req.user._id);

    if (!user) {
        throw new ApiError(404, "User Not Found");
    }

    if (!user.twoFactorSecret) {
        return res.status(400).json(
            new ApiResponse(400, {}, "2FA not initialized")
        );
    }

    const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: "base32",
        token: token.toString().trim(),
        window: 1
    });

    if (!verified) {
        throw new ApiError(400, "Invalid OTP");
    }

    user.twoFactorEnabled = true;
    await user.save();

    return res.status(200).json(
        new ApiResponse(200, "2FA enabled successfully")
    );
});

const verify2FALogin = asyncHandler(async (req, res) => {
    const { userId, token } = req.body;

    const user = await User.findById(userId);

    if (!user || !user.twoFactorSecret) {
        throw new ApiError(400, "Invalid request");
    }

    const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: "base32",
        token: token.toString().trim(),
        window: 1
    });

    if (!verified) {
        throw new ApiError(400, "Invalid OTP");
    }

    const { accessToken, refreshToken } =
        await generateAccessAndRefreshToken(user._id);

    user.refreshToken = refreshToken;
    await user.save();

    const cookieOption = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
    };

    return res.status(200)
        .cookie("accessToken", accessToken, cookieOption)
        .cookie("refreshToken", refreshToken, cookieOption)
        .json(
            new ApiResponse(
                200,
                { accessToken, refreshToken },
                "2FA Verified"
            )
        );
});

const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken =
        req.cookies?.refreshToken ||
        req.body?.refreshToken;

    if (!incomingRefreshToken) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    let decodedToken;

    try {
        decodedToken = JWT.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        );
    } catch (error) {
        console.log(error);
        throw new ApiError(
            401,
            "Invalid or Expired Refresh Token"
        );
    }

    const user = await User.findById(decodedToken?._id);

    if (!user) {
        throw new ApiError(404, "User Not Found");
    }

    if (incomingRefreshToken !== user.refreshToken) {
        throw new ApiError(
            401,
            "Refresh Token Is Expired Or Already Used"
        );
    }

    const { accessToken, refreshToken } =
        await generateAccessAndRefreshToken(user._id);

    const cookieOption = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
    };

    return res
        .status(200)
        .cookie("accessToken", accessToken, cookieOption)
        .cookie("refreshToken", refreshToken, cookieOption)
        .json(
            new ApiResponse(
                200,
                {
                    accessToken,
                    refreshToken,
                },
                "Access Token Refreshed Successfully"
            )
        );
});

export {
    registerUser,
    loginUser,
    sendVerifyAccountOtp,
    verifyAccount,
    sendForgetPasswordOtp,
    forgetPassword,
    changeName,
    deleteAccount,
    logoutUser,
    sendDeleteAccountOtp,
    updateAvatar,
    updateCoverImage,
    fetchUser,
    googleAuth,
    githubCallback,
    enable2FA,
    verify2FALogin,
    verify2FASetup,
    refreshAccessToken
}