import cookieParser from "cookie-parser";
import express from "express"
import cors from "cors"
import { verifySmtp } from "./utils/nodemailer.js";

const app = express();

app.use(cors({
    origin: ["http://localhost:5173", "http://localhost:3000", "http://localhost:5174"],
    credentials: true
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({extended: true}));

app.get("/", (req, res)=> {
    res.send("Auth MicroService Running");
})

app.get("/smtp", (req, res) => {
    const conn = verifySmtp;
    if(!conn) return;

    res.send("Smtp Connected Successfully")
})

// import route
import UserRouter from "./routes/user.routes.js"

// route declartion
app.use("/api/v1/auth", UserRouter);

export {app};