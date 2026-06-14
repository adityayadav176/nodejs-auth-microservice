import { Router } from "express";
import { loginUser, registerUser } from "../controllers/user.controllers.js"
import { upload } from "../middleware/multer.middleware.js"
import { loginlimiter } from "../rateLimiting/loginLimiter.js";

const router = Router();

router.post(
    "/register",
    upload.fields([
        {
            name: "avatar",
            maxCount: 1,
        },
        {
            name: "coverImage",
            maxCount: 1,
        },
    ]),
    registerUser
);

router.post("/login",loginlimiter, loginUser);

export default router