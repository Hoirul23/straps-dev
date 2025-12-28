
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        const menus = await prisma.training_menus.findMany();
        return NextResponse.json(menus);
    } catch (error) {
        console.error("GET Error:", error);
        return NextResponse.json({ error: 'Failed to fetch menus' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, exercises } = body;
        const newMenu = await prisma.training_menus.create({
            data: {
                name,
                exercises: exercises,
                created_at: new Date()
            }
        });
        return NextResponse.json(newMenu);
    } catch (error) {
        console.error("POST Error:", error);
        return NextResponse.json({ error: 'Failed to create menu' }, { status: 500 });
    }
}
