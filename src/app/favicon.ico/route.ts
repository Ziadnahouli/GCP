import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const url = new URL('/icon', request.url);
  return NextResponse.redirect(url);
}
