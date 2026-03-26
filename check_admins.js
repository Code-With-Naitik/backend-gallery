import mongoose from "mongoose";
import Admin from "./model/admin_model.js";
import dotenv from "dotenv";

dotenv.config();

const count = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URL);
        const admins = await Admin.find({}, 'email username');
        console.log(`TOTAL_ADMINS:${admins.length}`);
        admins.forEach(a => console.log(`ADMIN_EMAIL:${a.email}`));
        process.exit();
    } catch (err) {
        console.error("DB_ERROR:", err.message);
        process.exit(1);
    }
};

count();
