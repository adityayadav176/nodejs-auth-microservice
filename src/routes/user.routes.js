import { Router } from "express";
import { changeName, deleteAccount, fetchUser, forgetPassword, googleAuth, loginUser, logoutUser, registerUser, sendDeleteAccountOtp, sendForgetPasswordOtp, sendVerifyAccountOtp, updateAvatar, updateCoverImage, verifyAccount } from "../controllers/user.controllers.js"
import { upload } from "../middleware/multer.middleware.js"
import { loginRateLimit } from "../rateLimiting/loginLimiter.js";
import { verifyUser } from "../middleware/verifyUser.middleware.js";

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

router.post("/login", loginRateLimit, loginUser);
router.post("/sendEmailVerificationOtp",verifyUser, sendVerifyAccountOtp);
router.post("/VerifyEmail",verifyUser, verifyAccount);
router.post("/SendPasswordResetOtp",verifyUser, sendForgetPasswordOtp);
router.post("/forgetPassword",verifyUser, forgetPassword);
router.post("/changeName",verifyUser, changeName);
router.post("/logout",verifyUser, logoutUser);
router.post("/sendDeleteAccountOtp",verifyUser, sendDeleteAccountOtp);
router.post("/deleteAccount",verifyUser, deleteAccount);
router.get("/fetchUser",verifyUser, fetchUser);
router.patch("/update-avatar",
    verifyUser,
    upload.single("avatar"),
    updateAvatar
)
router.patch("/update-coverImage",
    verifyUser,
    upload.single("coverImage"),
    updateCoverImage
)
router.post("/google", googleAuth);
export default router