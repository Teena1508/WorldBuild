import { NextResponse } from 'next/server';
import { checkOllamaStatus } from '@/lib/ai/ollama';

export async function GET() {
  try {
    const status = await checkOllamaStatus();
    return NextResponse.json({ status });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to check AI status';
    return NextResponse.json(
      {
        status: {
          isAvailable: false,
          baseUrl: 'unknown',
          configuredModel: 'unknown',
          modelAvailable: false,
          installedModels: [],
          errorMessage: message,
          errorCode: 'UNKNOWN',
        },
      },
      { status: 200 }
    );
  }
}
