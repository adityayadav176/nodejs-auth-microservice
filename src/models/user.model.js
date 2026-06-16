import mongoose, { Schema } from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const UserSchema = new Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    coverImage: {
        url: {
            type: String,
            default: ""
        },
        public_id: {
            type: String,
            default: ""
        }
    },
    googleId: {
        type: String,
        unique: true,
        sparse: true,
    },
    password: {
        type: String,
        minlength: 8,
        maxlength: 100,
    },
    avatar: {
        url: {
            type: String,
            default: ""
        },
        public_id: {
            type: String,
            default: ""
        }
    },
    phoneNo: {
        type: String,
        unique: true,
        sparse: true,
    },
    role: {
        type: String,
        enum: ["User", "Admin"],
        default: "User"
    },
    isVerified: {
        type: Boolean,
        required: true,
        default: false,
    },
    failedLoginAttempts: {
        type: Number,
        default: 0
    },
    emailVerificationOTP: {
        type: String,
        default: ""
    },
    emailVerificationOTPExpiry: {
        type: Date
    },
    forgetPasswordOtp: {
        type: String,
        default: ""
    },
    forgetPasswordOtpExpiredAt: {
        type: Date
    },
    deleteAccountOtp: {
        type: String,
        default: ""
    },
    deleteAccountOtpExpiredAt: {
        type: Date
    },
    lockUntil: {
        type: Date,
        default: null
    },
    refreshToken: {
        type: String
    }
}, { timestamps: true })

UserSchema.pre("save", async function () {

    if (!this.isModified("password")) return;

    this.password = await bcrypt.hash(this.password, 10);
});

UserSchema.methods.isPasswordCorrect = async function (password) {
    return await bcrypt.compare(password, this.password);
};

UserSchema.methods.generateAccessToken = function () {
    return jwt.sign(
        {
            _id: this._id,
        },
        process.env.ACCESS_TOKEN_SECRET,
        {
            expiresIn: process.env.ACCESS_TOKEN_EXPIRY
        }
    );
};

UserSchema.methods.generateRefreshToken = function () {
    return jwt.sign(
        {
            _id: this._id
        },
        process.env.REFRESH_TOKEN_SECRET,
        {
            expiresIn: process.env.REFRESH_TOKEN_EXPIRY
        }
    );
};
export const User = mongoose.model("User", UserSchema)

