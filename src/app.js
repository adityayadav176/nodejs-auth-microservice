import cookieParser from "cookie-parser";
import express from "express"
import cors from "cors"
import { verifySmtp } from "./utils/nodemailer.js";

const app = express();

app.use(cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5500", "http://localhost:5500", "http://localhost:5174"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.get("/", (req, res) => {
    res.send("Auth MicroService Running");
})

app.get("/smtp", (req, res) => {
    const conn = verifySmtp;
    if (!conn) return;

    res.send("Smtp Connected Successfully")
})

// import route
import UserRouter from "./routes/user.routes.js"
import { errorHandler } from "./middleware/error.middleware.js";

// route declartion
app.use("/api/v1/auth", UserRouter);


app.use(errorHandler);

export { app };