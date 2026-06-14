import { uploadOnCloudinary } from "../utils/cloudinary.js"
import { transporter } from "../utils/nodemailer.js"
import { PROJECT_NAME } from "../constant/constant.js"
import { User } from "../models/user.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse..js"
import { asyncHandler } from "../utils/asyncHandler.js"

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
    console.log("Avatar Upload Result:", uploadAvatar);
    if (!uploadAvatar?.secure_url || !uploadAvatar?.public_id) {
        throw new ApiError(500, "Failed To Upload Avatar");
    }

    const uploadCoverImage = await uploadOnCloudinary(coverImageLocalPath);
    console.log("Cover Upload Result:", uploadCoverImage);

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
    }).select("+password");

    if (!user) {
        throw new ApiError(404, "User Not Found");
    }

    const isPasswordCorrect = await user.isPasswordCorrect(password);

    if (!isPasswordCorrect) {
        throw new ApiError(400, "Invalid Credintials");
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(user._id);

    user.password = undefined;
    
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
                {
                    user,
                    accessToken
                },
                "Login Successfully"
            )
        );
})

export {
    registerUser,
    loginUser
}