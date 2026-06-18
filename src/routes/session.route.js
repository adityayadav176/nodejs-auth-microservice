import {Router} from "express"
import { getAllSessions, logoutAllDevices, logoutSpecificDevice } from "../controllers/session.controller.js";
import { verifyUser } from "../middleware/verifyUser.middleware.js";

const router = Router();

router.get("/",verifyUser, getAllSessions);
router.delete("/logoutAllDevice",verifyUser, logoutAllDevices);
router.delete("/logoutSpecificDevice/:sessionId",verifyUser, logoutSpecificDevice);
export default router