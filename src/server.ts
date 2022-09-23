import express from 'express'
import cors from 'cors'
import { PrismaClient } from '@prisma/client'
import { generateToken, getCurrentUser, hash, verify } from './utils'

const app = express()
app.use(cors())
app.use(express.json())
const prisma = new PrismaClient()
const port = 5678

app.post('/sign-up', async (req, res) => {
  const { email, password } = req.body

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } })

    const errors: string[] = []

    if (typeof email !== 'string') {
      errors.push('Email missing or not a string')
    }

    if (typeof password !== 'string') {
      errors.push('Password missing or not a string')
    }

    if (errors.length > 0) {
      res.status(400).send({ errors })
      return
    }

    if (existingUser) {
      res.status(400).send({ errors: ['Email already exists.'] })
      return
    }

    const user = await prisma.user.create({
      data: { email, password: hash(password) }
    })
    const token = generateToken(user.id)
    res.send({ user, token })
  } catch (error) {
    // @ts-ignore
    res.status(400).send({ errors: [error.message] })
  }
})

app.post('/sign-in', async (req, res) => {
  try {
    const email = req.body.email
    const password = req.body.password

    const errors: string[] = []

    if (typeof email !== 'string') {
      errors.push('Email missing or not a string')
    }

    if (typeof password !== 'string') {
      errors.push('Password missing or not a string')
    }

    if (errors.length > 0) {
      res.status(400).send({ errors })
      return
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        sentTransactions: { include: { recipient: true } },
        receivedTransactions: { include: { sender: true } }
      }
    })
    if (user && verify(password, user.password)) {
      const token = generateToken(user.id)
      res.send({ user, token })
    } else {
      res.status(400).send({ errors: ['Username/password invalid.'] })
    }
  } catch (error) {
    // @ts-ignore
    res.status(400).send({ errors: [error.message] })
  }
})

app.get('/validate', async (req, res) => {
  try {
    const token = req.headers.authorization
    if (token) {
      const user = await getCurrentUser(token)

      if (user) {
        const newToken = generateToken(user.id)
        res.send({ user, token: newToken })
      } else {
        res.status(400).send({ errors: ['Token invalid.'] })
      }
    } else {
      res.status(400).send({ errors: ['Token not provided.'] })
    }
  } catch (error) {
    // @ts-ignore
    res.status(400).send({ errors: [error.message] })
  }
})

app.get('/transactions', async (req, res) => {
  try {
    const token = req.headers.authorization

    if (!token) {
      res.status(401).send({ errors: ['No token provided.'] })
      return
    }

    const user = await getCurrentUser(token)
    if (!user) {
      res.status(401).send({ errors: ['Invalid token provided.'] })
      return
    }

    res.send({
      sentTransactions: user.sentTransactions,
      receivedTransactions: user.receivedTransactions
    })
  } catch (error) {
    // @ts-ignore
    res.status(400).send({ errors: [error.message] })
  }
})

app.post('/transactions', async (req, res) => {
  const token = req.headers.authorization

  if (!token) {
    res.status(401).send({ errors: ['No token provided.'] })
    return
  }

  const user = await getCurrentUser(token)
  if (!user) {
    res.status(401).send({ errors: ['Invalid token provided.'] })
    return
  }

  const data = {
    amount: req.body.amount,
    recipientId: req.body.recipientId,
    senderId: user.id
  }

  const errors: string[] = []

  if (typeof data.amount !== 'number') {
    errors.push('Amount missing or not a number.')
  }

  if (data.amount < 0.01) {
    errors.push('You are not allowed to send less than 0.1.')
  }

  if (data.recipientId === data.senderId) {
    errors.push('You cannot send money to yourself.')
  }

  if (typeof data.recipientId !== 'number') {
    errors.push('Recipient id missing or not a number.')
  }

  if (data.amount > user.balance) {
    errors.push("You don't have enough money for this transaction.")
  }

  const recipient = await prisma.user.findUnique({
    where: { id: data.recipientId }
  })
  if (!recipient) {
    errors.push('Recipient does not exist.')
  }

  if (errors.length > 0) {
    res.status(400).send({ errors })
    return
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { balance: user.balance - data.amount }
  })

  await prisma.user.update({
    where: { id: data.recipientId },
    data: { balance: recipient!.balance + data.amount }
  })

  const transaction = await prisma.transaction.create({
    data,
    include: { recipient: { select: { id: true, email: true } } }
  })

  res.send(transaction)
})

app.listen(port, () => {
  console.log(`App running: http://localhost:${port}`)
})
