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
        const isLocalhost = origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1');
        const isLAN = /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin); // allow any LAN IP:PORT
        const isAllowed = allowedOrigins.includes(origin);

        if (isAllowed || isVercel || isLocalhost || isLAN) {
            callback(null, true);
        } else {
            callback(new Error(`Not allowed by CORS: ${origin}`));
        }
    },
    credentials: true,
}));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir) && !process.env.VERCEL) {
    fs.mkdirSync(uploadDir);
}
// For Vercel, use /tmp if writing is necessary, but static uploads won't persist across requests.

// Multer Config - Use memory storage for reliability (no disk read/write needed)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB limit

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
        const { username, email, password, role } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, email, password: hashedPassword, role: role || 'user' });
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

        const token = jwt.sign({ id: user._id, username: user.username, role: user.role || 'user' }, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.json({ token, user: { id: user._id, username: user.username, email: user.email, role: user.role || 'user' } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin Login
app.post("/auth/admin/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        let admin = await Admin.findOne({ email });
        let isTrueAdmin = true;

        if (!admin) {
            admin = await User.findOne({ email, role: 'admin' });
            isTrueAdmin = false;
        }

        if (!admin) return res.status(400).json({ error: "Admin credential failure." });

        const validPassword = await bcrypt.compare(password, admin.password);
        if (!validPassword) return res.status(400).json({ error: "Admin credential failure." });

        const token = jwt.sign({ id: admin._id, username: admin.username, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.json({
            token, user: {
                id: admin._id,
                username: admin.username,
                email: admin.email,
                role: 'admin',
                profilePic: admin.profilePic || ''
            }
        });
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

// UPDATE Admin (Protected)
app.put("/auth/admin", authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ error: "Unauthorized access." });
        const { username, email, profilePic } = req.body;

        const updateFields = {};
        if (username) updateFields.username = username;
        if (email) updateFields.email = email.toLowerCase();
        if (profilePic !== undefined) updateFields.profilePic = profilePic;

        const updatedAdmin = await Admin.findByIdAndUpdate(req.user.id, updateFields, { new: true });
        if (!updatedAdmin) return res.status(404).json({ error: "Admin registry not found." });

        res.json({
            id: updatedAdmin._id,
            username: updatedAdmin.username,
            email: updatedAdmin.email,
            role: 'admin',
            profilePic: updatedAdmin.profilePic || ''
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET all users (Protected - Admin only)
app.get("/auth/users", authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ error: "Access denied." });
        const users = await User.find({}, 'username email createdAt updatedAt uid status role');
        const admins = await Admin.find({}, 'username email createdAt updatedAt uid');

        let allUsers = [];

        users.forEach(u => allUsers.push({
            id: u.uid || u._id,
            mongoId: u._id,
            username: u.username,
            email: u.email,
            status: u.status || 'active',
            role: u.role || 'user',
            createdAt: u.createdAt
        }));

        admins.forEach(a => allUsers.push({
            id: a.uid || a._id,
            mongoId: a._id,
            username: a.username,
            email: a.email,
            status: 'active', // Admins are always active
            role: 'admin', // True Admins are admins
            createdAt: a.createdAt
        }));

        // Sort descending by creation date
        allUsers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.status(200).json(allUsers);
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

// UPDATE User Role (Protected - Admin only)
app.patch("/auth/users/:id/role", authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ error: "Access denied." });
        const { role } = req.body;
        if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: "Invalid role protocol." });

        const updatedUser = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
        if (!updatedUser) return res.status(404).json({ error: "User not found." });
        res.status(200).json({ message: "Identity role protocol updated.", role: updatedUser.role });
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

const transformImageUrl = (url, req) => {
    if (!url) return url;
    // Only transform if it's a local upload
    let pathname = url;
    if (url.startsWith('http')) {
        try { pathname = new URL(url).pathname; } catch { return url; }
    }

    if (!pathname.startsWith('/uploads/') || pathname.startsWith('data:')) {
        return url; // External URL or data URI, leave as-is
    }

    // Now build the correct absolute URL using the current request's host
    const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
    const host = req.headers['x-forwarded-host'] || req.get('host');
    return `${protocol}://${host}${pathname}`;
};

// CATEGORY ROUTES
// GET all categories (Public)
app.get("/category", async (req, res) => {
    try {
        const categories = await Category.find();
        const transformedCategories = categories.map(cat => {
            const obj = cat.toJSON();
            if (obj.imageUrl) obj.imageUrl = transformImageUrl(obj.imageUrl, req);
            return obj;
        });
        res.status(200).json(transformedCategories);
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

        const obj = category.toJSON();
        if (obj.imageUrl) obj.imageUrl = transformImageUrl(obj.imageUrl, req);
        res.status(200).json(obj);
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

        const transformedItems = (wishlist.items || []).map(item => {
            if (!item) return item;
            const obj = typeof item.toJSON === 'function' ? item.toJSON() : item;
            if (obj.imageUrl) obj.imageUrl = transformImageUrl(obj.imageUrl, req);
            return obj;
        });

        res.status(200).json(transformedItems);
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

        const transformedItems = (updatedWishlist.items || []).map(item => {
            if (!item) return item;
            const obj = typeof item.toJSON === 'function' ? item.toJSON() : item;
            if (obj.imageUrl) obj.imageUrl = transformImageUrl(obj.imageUrl, req);
            return obj;
        });

        res.status(200).json(transformedItems);
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
// Returns a fully embedded Base64 string so images survive across all devices and serverless instances
app.post("/api/upload", upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
    }

    try {
        // File is in memory buffer - no disk read needed
        const base64Str = `data:${req.file.mimetype};base64,` + req.file.buffer.toString('base64');
        res.json({ imageUrl: base64Str });
    } catch (err) {
        res.status(500).json({ error: "Failed to process the visual asset." });
    }
});

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    const PORT = process.env.PORT || 8001;
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

export default app;