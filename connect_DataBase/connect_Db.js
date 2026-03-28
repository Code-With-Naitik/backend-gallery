import mongoose from "mongoose";

let lastError = null;
export const getLastError = () => lastError;

const Connect_Db = async () => {
    let url = (process.env.MONGO_URL || "").trim();
    if (url.startsWith("'") || url.startsWith('"')) url = url.slice(1, -1);
    
    if (!url) {
        console.error("MONGO_URL is not defined in environment variables!");
        return;
    }
    try {
        await mongoose.connect(url);
        console.log("Connected to MongoDB");

        // One-time cleanup of problematic stale index
        try {
            const db = mongoose.connection.db;
            await db.collection('users').dropIndex('id_1');
            console.log("Stale 'id_1' index dropped");
        } catch (e) {
            // Index likely already gone or doesn't exist
        }
    } catch (error) {
        lastError = error.message;
        console.log(error);
    }
}

export default Connect_Db;
