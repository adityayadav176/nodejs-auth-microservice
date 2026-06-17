import { UAParser } from "ua-parser-js";

export const deviceInfoMiddleware = (req, res, next) => {
    const parser = new UAParser(
        req.headers["user-agent"]
    );

    req.deviceInfo = parser.getResult();

    next();
};