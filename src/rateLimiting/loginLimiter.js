import rateLimit from "express-rate-limit";

export const loginlimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,

    message: {
        success: false,
        message: "Too Many attempts. Try again after 15 minutes."
    },

    standardHeaders: true,
    legacyHeaders: false,
})