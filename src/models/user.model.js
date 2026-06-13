import mongoose, {Schema} from "mongoose";
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
            required: true
        },
        public_id: {
            type: String,
            required: true
        }
    },
    password: {
        type: String,
        required: true,
        minLength: 8,
        maxLength: 100,
    },
    avatar: {
        url: {
            type: String,
            required: true
        },
        public_id: {
            type: String,
            required: true
        }
    },
    phoneNo: {
        type: String,
        required: true,
        unique: true,
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
    refreshToken: {
        type: String
    }
}, {timestamps: true})

UserSchema.save(async() => {
    if(!this.isModified("Password")) return;

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(this.password, salt);
})

UserSchema.methods.isPasswordCorrect = async() => {
    return await bcrypt.compare(this.password, password);
}

UserSchema.methods.generateAccessToken = () => {
    jwt.sign(
        {
            email: this.email,
            _id: this._id
        },
        process.env.ACCESS_TOKEN_SECRET,
        {
            expiresIn: process.env.ACCESS_TOKEN_EXPIRY
        }
    )
}

UserSchema.methods.generateRefreshToken = () => {
    jwt.sign(
        {
            email: this.email,
            _id: this._id
        },
        process.env.REFRESH_TOKEN_SECRET,
        {
            expiresIn: process.env.REFRESH_TOKEN_EXPIRY
        }
    )
}
export const User = mongoose.model("User", UserSchema)

