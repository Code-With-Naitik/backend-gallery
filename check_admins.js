import mongoose from "mongoose";
import Admin from "./model/admin_model.js";
import dotenv from "dotenv";

dotenv.config();

const count = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URL);
        const adminCount = await Admin.countDocuments();
        console.log(`TOTAL_ADMINS:${adminCount}`);
        process.exit();
    } catch (err) {
        process.exit(1);
    }
};

count();
