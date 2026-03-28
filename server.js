import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from 'url';
import Connect_Db, { getLastError } from "./connect_DataBase/connect_Db.js";
import Category from "./model/category_model.js";
import User from "./model/user_model.js";
import Admin from "./model/admin_model.js";
import Wishlist from "./model/wishlist_model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const allowedOrigins = [
    "http://localhost:5174",
    "http://192.168.29.213:5174",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "https://frontend-gallery.vercel.app",
    "https://frontend-gallery-delta.vercel.app/"
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);

        const isVercel = origin.endsWith('.vercel.app');
        const isAllowed = allowedOrigins.includes(origin);

        if (isAllowed || isVercel) {
            callback(null, true);
        } else {
            callback(new Error(`Not allowed by CORS: ${origin}`));
        }
    },
    credentials: true,
}));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir) && !process.env.VERCEL) {
    fs.mkdirSync(uploadDir);
}
// For Vercel, use /tmp if writing is necessary, but static uploads won't persist across requests.

// Multer Config
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Vercel only allows writing to /tmp
        const dest = process.env.VERCEL ? '/tmp' : 'uploads/';
        cb(null, dest);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Connect to DB (don't block invocation if it fails)
Connect_Db().catch(err => console.error("Initial DB connection failed:", err));

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: "Access denied. Token missing." });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Token is invalid or expired." });
        req.user = user;
        next();
    });
};

app.get("/", (req, res) => {
    res.send("Hello World!");
});

app.get("/health", async (req, res) => {
    if (mongoose.connection.readyState !== 1) {
        await Connect_Db();
    }

    res.status(200).json({
        status: "alive",
        database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
        mongo_error: getLastError(),
        mongo_url_exists: !!process.env.MONGO_URL,
        vercel: !!process.env.VERCEL,
        env: process.env.NODE_ENV
    });
});

// AUTH ROUTES
// Register
app.post("/auth/register", async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, email, password: hashedPassword });
        await newUser.save();
        res.status(201).json({ message: "User registered successfully" });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Admin Register
app.post("/auth/admin/register", async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const newAdmin = new Admin({ username, email, password: hashedPassword });
        await newAdmin.save();
        res.status(201).json({ message: "Admin registered successfully" });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Login
app.post("/auth/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ error: "User not found" });

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ error: "Invalid password" });

        const token = jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.json({ token, user: { id: user._id, username: user.username, email: user.email } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin Login
app.post("/auth/admin/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const admin = await Admin.findOne({ email });
        if (!admin) return res.status(400).json({ error: "Admin credential failure." });

        const validPassword = await bcrypt.compare(password, admin.password);
        if (!validPassword) return res.status(400).json({ error: "Admin credential failure." });

        const token = jwt.sign({ id: admin._id, username: admin.username, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.json({ token, user: { id: admin._id, username: admin.username, email: admin.email, role: 'admin' } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// UPDATE User (Protected)
app.put("/auth/user", authenticateToken, async (req, res) => {
    try {
        const { username, email } = req.body;

        const updateFields = {};
        if (username && username.trim()) updateFields.username = username.trim();
        if (email && email.trim()) updateFields.email = email.trim().toLowerCase();

        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ error: "No valid update fields provided." });
        }

        // Prevent duplicate email
        if (updateFields.email) {
            const existing = await User.findOne({ email: updateFields.email, _id: { $ne: req.user.id } });
            if (existing) {
                return res.status(400).json({ error: "Email is already in use by another account." });
            }
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.user.id,
            updateFields,
            { new: true, runValidators: true }
        );

        if (!updatedUser) {
            return res.status(404).json({ error: "User not found" });
        }

        res.status(200).json({ id: updatedUser._id, username: updatedUser.username, email: updatedUser.email });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// UPDATE Admin (Protected)
app.put("/auth/admin", authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ error: "Unauthorized access." });
        const { username, email } = req.body;
        const updateFields = {};
        if (username && username.trim()) updateFields.username = username.trim();
        if (email && email.trim()) updateFields.email = email.trim().toLowerCase();

        const updatedAdmin = await Admin.findByIdAndUpdate(req.user.id, updateFields, { new: true });
        if (!updatedAdmin) return res.status(404).json({ error: "Admin not found" });
        res.json({ id: updatedAdmin._id, username: updatedAdmin.username, email: updatedAdmin.email, role: 'admin' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// DELETE Admin (Protected)
app.delete("/auth/admin", authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ error: "Unauthorized access." });
        const deletedAdmin = await Admin.findByIdAndDelete(req.user.id);
        if (!deletedAdmin) return res.status(404).json({ error: "Admin not found" });
        res.status(200).json({ message: "Admin deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET all users (Protected - Admin only)
app.get("/auth/users", authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ error: "Access denied." });
        const users = await User.find({}, 'username email createdAt updatedAt uid status');
        // Standardize returning uid as id for consistency with frontend
        const formattedUsers = users.map(u => ({
            id: u.uid || u._id,
            mongoId: u._id,
            username: u.username,
            email: u.email,
            status: u.status || 'active',
            createdAt: u.createdAt
        }));
        res.status(200).json(formattedUsers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE User by ID (Protected - Admin only)
app.delete("/auth/users/:id", authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ error: "Access denied." });
        const deletedUser = await User.findByIdAndDelete(req.params.id);
        if (!deletedUser) return res.status(404).json({ error: "User not found." });
        res.status(200).json({ message: "User protocols successfully terminated." });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// UPDATE User Status (Protected - Admin only)
app.patch("/auth/users/:id/status", authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ error: "Access denied." });
        const { status } = req.body;
        if (!['active', 'pending'].includes(status)) return res.status(400).json({ error: "Invalid status protocol." });

        const updatedUser = await User.findByIdAndUpdate(req.params.id, { status }, { new: true });
        if (!updatedUser) return res.status(404).json({ error: "User not found." });
        res.status(200).json({ message: "Identity status protocol updated.", status: updatedUser.status });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE User (Protected)
app.delete("/auth/user", authenticateToken, async (req, res) => {
    try {
        const deletedUser = await User.findByIdAndDelete(req.user.id);
        if (!deletedUser) {
            return res.status(404).json({ error: "User not found" });
        }
        res.status(200).json({ message: "User deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// CATEGORY ROUTES
// GET all categories (Public)
app.get("/category", async (req, res) => {
    try {
        const categories = await Category.find();
        res.status(200).json(categories);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET category by ID (Public)
app.get("/category/:id", async (req, res) => {
    try {
        const query = mongoose.Types.ObjectId.isValid(req.params.id)
            ? { _id: req.params.id }
            : { cid: Number(req.params.id) };

        const category = await Category.findOne(query);
        if (!category) return res.status(404).json({ error: "Prompt not found" });
        res.status(200).json(category);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// CREATE a category (Public for now)
app.post("/category", async (req, res) => {
    try {
        const { title, imageUrl, prompt, tags, category, modelName } = req.body;
        const newCategory = new Category({ title, imageUrl, prompt, tags, category, modelName });
        await newCategory.save();
        res.status(201).json(newCategory);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// UPDATE a category (Public for now)
app.put("/category/:id", async (req, res) => {
    try {
        const { title, imageUrl, prompt, tags, category, modelName } = req.body;
        const query = mongoose.Types.ObjectId.isValid(req.params.id)
            ? { _id: req.params.id }
            : { cid: Number(req.params.id) };

        const updatedCategory = await Category.findOneAndUpdate(
            query,
            { title, imageUrl, prompt, tags, category, modelName },
            { new: true, runValidators: true }
        );
        if (!updatedCategory) {
            return res.status(404).json({ error: "Category not found" });
        }
        res.status(200).json(updatedCategory);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// DELETE a category (Protected)
app.delete("/category/:id", authenticateToken, async (req, res) => {
    try {
        const query = mongoose.Types.ObjectId.isValid(req.params.id)
            ? { _id: req.params.id }
            : { cid: Number(req.params.id) };

        const deletedCategory = await Category.findOneAndDelete(query);
        if (!deletedCategory) {
            return res.status(404).json({ error: "Category not found" });
        }
        res.status(200).json({ message: "Category deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// WISHLIST ROUTES
// GET user's wishlist (Protected)
app.get("/wishlist", authenticateToken, async (req, res) => {
    try {
        let wishlist = await Wishlist.findOne({ userId: req.user.id }).populate('items');
        if (!wishlist) {
            wishlist = new Wishlist({ userId: req.user.id, items: [] });
            await wishlist.save();
        }
        res.status(200).json(wishlist.items);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// TOGGLE an item in the wishlist (Protected)
app.post("/wishlist/toggle", authenticateToken, async (req, res) => {
    try {
        const { categoryId } = req.body;
        if (!categoryId) return res.status(400).json({ error: "Category ID is required" });

        // Resolve categoryId to its actual MongoDB _id if it's a CID or UID
        let category;
        if (mongoose.Types.ObjectId.isValid(categoryId)) {
            category = await Category.findById(categoryId);
        } else {
            const numId = Number(categoryId);
            if (!isNaN(numId)) {
                category = await Category.findOne({ $or: [{ cid: numId }, { uid: numId }, { id: numId }] });
            }
        }

        if (!category) return res.status(404).json({ error: "Category not found" });
        const targetObjectId = category._id;

        let wishlist = await Wishlist.findOne({ userId: req.user.id });
        if (!wishlist) {
            wishlist = new Wishlist({ userId: req.user.id, items: [] });
        }

        // Check if item already in wishlist using ObjectId comparison
        const index = wishlist.items.findIndex(id => id.toString() === targetObjectId.toString());
        if (index === -1) {
            wishlist.items.push(targetObjectId);
        } else {
            wishlist.items.splice(index, 1);
        }

        await wishlist.save();
        const updatedWishlist = await Wishlist.findOne({ userId: req.user.id }).populate('items');
        res.status(200).json(updatedWishlist.items || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// CLEAR wishlist (Protected)
app.delete("/wishlist", authenticateToken, async (req, res) => {
    try {
        const wishlist = await Wishlist.findOneAndUpdate(
            { userId: req.user.id },
            { items: [] },
            { new: true }
        );
        res.status(200).json({ message: "Wishlist cleared successfully", items: [] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// UPLOAD ROUTE
app.post("/api/upload", upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
    }
    const host = req.get('host');
    const protocol = req.protocol;
    const imageUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
    res.json({ imageUrl });
});

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    const PORT = process.env.PORT || 8001;
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

export default app;
