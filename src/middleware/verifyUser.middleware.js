import { Session } from "../models/session.model.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import jwt from "jsonwebtoken";

export const verifyUser = asyncHandler(async (req, _, next) => {
    const token =
        req.cookies?.accessToken ||
        req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
        throw new ApiError(401, "Unauthorized Access Denied");
    }

    const decodedToken = jwt.verify(
        token,
        process.env.ACCESS_TOKEN_SECRET
    );

    const user = await User.findById(
        decodedToken._id
    ).select("-password -refreshToken");

    if (!user) {
        throw new ApiError(401, "User Not Found");
    }

    // Token Version Check
    if (decodedToken.tokenVersion !== user.tokenVersion) {
        throw new ApiError(
            401,
            "Session Expired. Login Again."
        );
    }

    const session = await Session.findById(
        decodedToken.sessionId
    );

    if (!session) {
        throw new ApiError(
            401,
            "Session Not Found"
        );
    }

    req.user = user;
    req.session = session;
    req.sessionId = session._id;

    next();
});