import mongoose from "mongoose";
import { MONGO_DB_NAME } from "../constant/constant.js";

const connectToMongo = async() => {
   try {
     const conn = await mongoose.connect(`${process.env.MONGO_DB_URI}/ ${MONGO_DB_NAME}`);
 
     console.log(`MongoDb Connected: ${conn.connection.name}`);
   } catch (error) {
    console.log("MongoDb Connection Failed", error.message);
    process.exit(1);
   }
}

export { connectToMongo };