
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, role } = body;

        if (!name || !role || !['COACH', 'CLIENT'].includes(role)) {
            return NextResponse.json({ error: 'Invalid name or role' }, { status: 400 });
        }

        // Generate 6-char random ID
        const generateId = () => {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
            let result = '';
            for (let i = 0; i < 6; i++) {
                result += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return result;
        };

        let uniqueId = generateId();
        let exists = await prisma.users.findUnique({ where: { id: uniqueId } });
        while (exists) {
            uniqueId = generateId();
            exists = await prisma.users.findUnique({ where: { id: uniqueId } });
        }

        const newUser = await prisma.users.create({
            data: {
                id: uniqueId,
                name,
                role,
                created_at: new Date()
            }
        });

        return NextResponse.json(newUser);
    } catch (error) {
        console.error("Register Error:", error);
        return NextResponse.json({ error: 'Failed to register user' }, { status: 500 });
    }
}
