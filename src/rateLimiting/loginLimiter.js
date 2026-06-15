import { ApiError } from "../utils/ApiError.js";

const loginAttempts = new Map();

export const loginRateLimit = (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();

    // Create bucket for new IP
    if (!loginAttempts.has(ip)) {
        loginAttempts.set(ip, {
            tokens: 5,
            lastRefill: now
        });
    }

    const bucket = loginAttempts.get(ip);

    // Refill 1 token every 12 seconds
    const refillRate = 1;
    const refillInterval = 12 * 1000;

    const elapsed = now - bucket.lastRefill;
    const tokensToAdd =
        Math.floor(elapsed / refillInterval) * refillRate;

    if (tokensToAdd > 0) {
        bucket.tokens = Math.min(
            5,
            bucket.tokens + tokensToAdd
        );

        bucket.lastRefill = now;
    }

    // No tokens left
    if (bucket.tokens <= 0) {
        return next(
            new ApiError(
                429,
                "Too many login attempts. Try again later."
            )
        );
    }

    // Consume token
    bucket.tokens--;

    next();
};