import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

const users = [];

export async function registerUser(email, password) {
    if (!email || typeof email !== 'string' || !email.includes('@')) {
        throw { status: 400, message: 'A valid email is required' };
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
        throw { status: 400, message: 'Password must be at least 6 characters' };
    }

    const existing = users.find(u => u.email === email);
    if (existing) {
        throw { status: 409, message: 'Email already registered' };
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = {
        id: randomUUID(),
        email,
        password: hashed,
        createdAt: Date.now(),
    };
    users.push(user);
    return { id: user.id, email: user.email };
}

export async function loginUser(email, password) {
    const user = users.find(u => u.email === email);
    if (!user) {
        throw { status: 401, message: 'Invalid credentials' };
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
        throw { status: 401, message: 'Invalid credentials' };
    }

    const token = jwt.sign(
        { userId: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
    );
    return { token, user: { id: user.id, email: user.email } };
}
