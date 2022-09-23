import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
dotenv.config()

export function hash (password: string) {
  return bcrypt.hashSync(password, 10)
}

export function verify (password: string, hash: string) {
  return bcrypt.compareSync(password, hash)
}

export function generateToken (id: number) {
  return jwt.sign({ id }, process.env.SECRET!)
}

export async function getCurrentUser (token = '') {
  try {
    const data = jwt.verify(token, process.env.SECRET!)
    const user = await prisma.user.findUnique({
      where: { id: (data as any).id },
      include: {
        receivedTransactions: {
          include: { sender: true }
        },
        sentTransactions: {
          include: { recipient: true }
        }
      }
    })
    return user
  } catch (error) {
    return null
  }
}
