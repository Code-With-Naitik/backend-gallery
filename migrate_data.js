import mongoose from "mongoose";
import Category from "./model/category_model.js";
import dotenv from "dotenv";

dotenv.config();

const migrate = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URL);
        console.log("Connected to MongoDB for migration");

        const categories = await Category.find();
        console.log(`Found ${categories.length} categories`);

        let updatedCount = 0;
        for (const cat of categories) {
            let changed = false;
            
            // Map name to title if title is missing
            if (!cat.title && cat.get('name')) {
                cat.title = cat.get('name');
                changed = true;
            }

            // Map thumbnail to imageUrl if imageUrl is missing
            if (!cat.imageUrl && cat.get('thumbnail')) {
                cat.imageUrl = cat.get('thumbnail');
                changed = true;
            }

            // Ensure prompt exists for old data
            if (!cat.prompt) {
                cat.prompt = "No prompt available";
                changed = true;
            }

            if (changed) {
                await cat.save();
                updatedCount++;
            }
        }

        console.log(`Migration complete. Updated ${updatedCount} records.`);
    } catch (error) {
        console.error("Migration failed:", error);
    } finally {
        await mongoose.connection.close();
    }
};

migrate();
