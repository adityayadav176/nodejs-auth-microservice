import nodemailer from "nodemailer"
import dotenv from 'dotenv'

dotenv.config();

const transporter = nodemailer.createTransport({
    host: "smtp-relay.brevo.com",
    port: 587,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
    }
})

const verifySmtp = () => {
    try {
        transporter.verify();
        console.log("Smtp Server Is Running");
    } catch (error) {
        console.log("Smtp Server Failed: ", error.message);
        process.exit(1);
    }
}
export {
    transporter,
    verifySmtp
}