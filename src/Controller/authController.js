import {prisma} from "../config/db.js"
import bcrypt from "bcryptjs";
import { generateToken } from "../utils/generateToken.js";

const register = async (req,res)=>{
     const body=req.body;
    const {name,email,password} = req.body;
    // viet gon cua: day la detructoring
    /*
    const name = req.body.name;
    const email = req.body.email;
    const password = req.body.password;
    */
    const userExits =  await prisma.user.findUnique({
        where: {email: email}
    })
    if(userExits){
        return res
        .status(400)
        .json({error: "User already exists with this email"})
    }
    //Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password,salt);

    //create user
    const user = await prisma.user.create({
        data:{
            name,
            email,
            password: hashedPassword
        }
    })
      //generate JWT token
    const token = generateToken(user.id,res)
    res.status(201).json({
        status: "success",
        data: {
            user: {
                id: user.id,
                name: name,
                email: email
            },
            token
        }
    })
}
//JWT
const login = async(req,res) =>{
    const {email,password} = req.body;
    // check if user email exists in the table
     const userExits =  await prisma.user.findUnique({
        where: {email: email}
    })
    if(!userExits){
        return res
        .status(400)
        .json({error: "Invalid email or password"})
    }
    const isPassword = await bcrypt.compare(password,userExits.password);
    if(!isPassword){
        return res
        .status(400)
        .json({error: "Invalid email or password"})
    }
    //generate JWT token
    const token = generateToken(userExits.id,res)

    res.status(201).json({
        status: "success",
        data: {
            user: {
                id: userExits.id,
                email: email
            },
            token
        }
    })
}

const logout = async (req,res) =>{
    res.cookie("jwt","0",{
        httpOnly: true,
        exprires: new Date(0)
    })
    res.status(201).json({
        status: "success",
        message: "logged out successfully"
    })
}
export {register,login,logout}
//loi 400 la ve ben cliend
//loi 500 la ve ben khach hang