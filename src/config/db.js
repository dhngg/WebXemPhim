import {PrismaClient} from "@prisma/client";
const prisma = new PrismaClient({
    log: 
        process.env.NODE_ENV === "development"
        ? ["query","error","warn"]
        : ["error"] // neu node_env la development thi se xem duoc nhieu hon
});
const connectDB = async() =>{
    try{
        await prisma.$connect();
        console.log("DB connected via Prisma")
    } catch(error){
        console.log(`DB connected error: ${error.message}`)
        process.exit(1);
    }
};

const disconnectDB =async () =>{
    await prisma.$disconnect();
};
export {prisma,connectDB,disconnectDB};