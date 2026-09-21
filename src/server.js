import express from "express";
import {config} from "dotenv";
import {connectDB,disconnectDB} from './config/db.js'
//import routers
import movieRoute from "./routes/moviesRoutes.js"
import authRoute from "./routes/authRoutes.js"
import watchlistRoute from "./routes/WatchlistRoutes.js"
config();
connectDB();
const app =  express();
const PORT =8080;
app.use(express.json()); //doc du lieu json thanh js cho vao body
app.use(express.urlencoded({extended:true}))
//doc du lieu duoc gui tu from html
//API routes
app.use("/movies",movieRoute); //neu request co /movies thi chuyn request cho cho movieRoutes
app.use("/auth",authRoute);
app.use("/watchlist",watchlistRoute);
const server = app.listen(PORT,()=>{
    console.log(`Server running on port ${PORT}`);
});
//process.on la de bat cac biến cố lỗi của tiến trình xảy ra
//server.close la doi các resquest chạy xong rồi mới tắt
process.on("unhandledRejection",(err)=>{
    console.err("unhandledRejection: ",err);
    server.close(async()=>{
        await disconnectDB();
        process.exit(1);
    })
});

//loi nay nghiem trong nen ko can doi resquest phan hoi
// nen cta can tat luon process
process.on("uncaughtException",async (err)=>{
    console.err("Uncaught Exception: ",err);
        await disconnectDB();
        process.exit(1);
});

process.on("SIGTERM",(err)=>{
    console.err("SIGTERM received, shutting down gracefully ",err);
    server.close(async()=>{
        await disconnectDB();
        process.exit(1);
    })
});

