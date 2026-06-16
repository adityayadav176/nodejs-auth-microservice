import { uploadOnCloudinary } from "../utils/cloudinary.js"
import { transporter } from "../utils/nodemailer.js"
import { PROJECT_NAME } from "../constant/constant.js"
import { User } from "../models/user.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import bcrypt from "bcrypt"
import cloudinary from "cloudinary"
import {OAuth2Client} from "google-auth-library"

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
    const { email, phoneNo, password } = req.body

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

    return res.status(200)
        .cookie("accessToken", accessToken, cookieOption)
        .cookie("refreshToken", refreshToken, cookieOption)
        .json(
            new ApiResponse(
                200,
                {
                    user,
                    accessToken
                },
                "Login Successfully"
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

const sendForgetPasswordOtp = asyncHandler(async (req, res) => {
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(400, "Unauthorized Access Denied");
    }

    const user = await User.findById(userId);

    if (!user) {
        throw new ApiError(404, "User Not Found");
    }

    if (user.forgetPasswordOtpExpiredAt && user.forgetPasswordOtpExpiredAt > Date.now()) {
        throw new ApiError(429, "Please Wait Before requesting Another Otp");
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedOtp = await bcrypt.hash(otp, 10);

    user.forgetPasswordOtp = hashedOtp;
    user.forgetPasswordOtpExpiredAt = Date.now() + 2 * 60 * 1000;
    await user.save({ validateBeforeSave: false });

    try {
        await transporter.sendMail({
            from: process.env.SENDER_EMAIL,
            to: user.email,
            subject: "Password Reset Otp",
            html: `
          <h2>Reset Your Password</h2>
          <p>Your OTP is:</p>
          <h1>${otp}</h1>
          <p>Valid for 2 minutes.</p>
      `
        })
    } catch (error) {
        user.forgetPasswordOtp = undefined,
            user.forgetPasswordOtpExpiredAt = undefined,
            await user.save({ validateBeforeSave: false });
    }
    return res.status(200)
        .json(
            new ApiResponse(200, {}, "Password Reset Otp Send Successfully")
        )
})

const forgetPassword = asyncHandler(async (req, res) => {
    const { password, otp } = req.body;

    if (!password || !otp) {
        throw new ApiError(400, "Password And Otp Are Required");
    }

    const userId = req.user?._id;
    if (!userId) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    const user = await User.findById(userId);
    if (!user) {
        throw new ApiError(404, "User Not Found");
    }

    if (user.forgetPasswordOtpExpiredAt < Date.now()) {
        throw new ApiError(400, "Otp Expired");
    }

    const isOtpValid = await bcrypt.compare(otp, user.forgetPasswordOtp);

    if (!isOtpValid) {
        throw new ApiError(400, "Invalid Otp");
    }

    user.password = password
    user.forgetPasswordOtp = undefined;
    user.forgetPasswordOtpExpiredAt = undefined;

    user.save({ validateBeforeSave: false });

    return res.status(200)
        .json(
            new ApiResponse(200, {}, "Password updated Successfully")
        )
})

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

    if(!payload?.email) {
        throw new ApiError(400, "Invalid Google Token");
    }

    const {sub: googleId, email, name, picture} = payload;

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

    const {accessToken, refreshToken} = await generateAccessAndRefreshToken(user._id);

    user.refreshToken = refreshToken;

    await user.save({validateBeforeSave: false});

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
    googleAuth
}