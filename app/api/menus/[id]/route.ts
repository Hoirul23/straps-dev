
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
    request: Request,
    props: { params: Promise<{ id: string }> } // Change to Promise type
) {
    try {
        const params = await props.params; // Await the params
        const id = parseInt(params.id);
        if (isNaN(id)) {
            return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
        }

        const menu = await prisma.training_menus.findUnique({
            where: { id: id }
        });

        if (!menu) {
            return NextResponse.json({ error: 'Menu not found' }, { status: 404 });
        }

        return NextResponse.json(menu);
    } catch (error) {
        console.error("GET Menu Detail Error:", error);
        return NextResponse.json({ error: 'Failed to fetch menu' }, { status: 500 });
    }
}
