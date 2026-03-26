import mongoose from "mongoose";

const Connect_Db = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URL);
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
        console.log(error);
    }
}

export default Connect_Db;
