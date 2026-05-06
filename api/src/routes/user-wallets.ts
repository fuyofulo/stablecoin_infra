import { PublicKey } from '@solana/web3.js';
import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { ApiError, badRequest } from '../api-errors.js';
import { config } from '../config.js';
import { prisma } from '../prisma.js';

export const userWalletsRouter = Router();

const createChallengeSchema = z.object({
  walletAddress: z.string().trim().min(1),
});

const connectExternalWalletSchema = z.object({
  walletAddress: z.string().trim().min(1),
  nonce: z.string().trim().min(16).max(256),
  signedMessageBase64: z.string().trim().min(1),
  signatureBase64: z.string().trim().min(1),
  provider: z.string().trim().max(80).optional(),
  label: z.string().trim().max(120).optional(),
});

const registerEmbeddedWalletSchema = z.object({
  walletAddress: z.string().trim().min(1),
  provider: z.string().trim().min(1).max(80).default('privy'),
  providerWalletId: z.string().trim().max(160).optional(),
  label: z.string().trim().max(120).optional(),
});

const createManagedWalletSchema = z.object({
  provider: z.enum(['privy', 'fireblocks', 'coinbase_cdp', 'para', 'turnkey', 'dfns']),
  label: z.string().trim().min(1).max(100).optional(),
});

userWalletsRouter.get('/user-wallets', async (req, res, next) => {
  try {
    const items = await prisma.userWallet.findMany({
      where: {
        userId: req.auth!.userId,
        status: 'active',
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ items: items.map(serializeUserWallet) });
  } catch (error) {
    next(error);
  }
});

userWalletsRouter.post('/user-wallets/challenge', async (req, res, next) => {
  try {
    const input = createChallengeSchema.parse(req.body);
    const walletAddress = normalizeSolanaAddress(input.walletAddress);
    const nonce = crypto.randomBytes(24).toString('hex');
    const message = [
      'Decimal wallet verification',
      '',
      `Wallet: ${walletAddress}`,
      `User: ${req.auth!.userId}`,
      `Nonce: ${nonce}`,
      '',
      'This signature links this wallet to your Decimal account. It does not authorize a transaction.',
    ].join('\n');

    await prisma.walletChallenge.create({
      data: {
        userId: req.auth!.userId,
        walletAddress,
        nonceHash: hashNonce(nonce),
        message,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    res.status(201).json({
      chain: 'solana',
      walletAddress,
      nonce,
      message,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

userWalletsRouter.post('/user-wallets/external', async (req, res, next) => {
  try {
    const input = connectExternalWalletSchema.parse(req.body);
    const walletAddress = normalizeSolanaAddress(input.walletAddress);
    const challenge = await prisma.walletChallenge.findFirst({
      where: {
        userId: req.auth!.userId,
        walletAddress,
        nonceHash: hashNonce(input.nonce),
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge || challenge.expiresAt <= new Date()) {
      throw badRequest('Wallet verification challenge expired. Try connecting the wallet again.');
    }

    const signedMessage = Buffer.from(input.signedMessageBase64, 'base64');
    const signature = Buffer.from(input.signatureBase64, 'base64');
    if (!signedMessage.toString('utf8').includes(input.nonce)) {
      throw badRequest('Signed message does not match the active wallet challenge.');
    }

    if (!verifyEd25519Signature(walletAddress, signedMessage, signature)) {
      throw badRequest('Wallet signature could not be verified.');
    }

    const wallet = await prisma.$transaction(async (tx) => {
      await tx.walletChallenge.update({
        where: { walletChallengeId: challenge.walletChallengeId },
        data: { consumedAt: new Date() },
      });

      return tx.userWallet.upsert({
        where: {
          userId_chain_walletAddress: {
            userId: req.auth!.userId,
            chain: 'solana',
            walletAddress,
          },
        },
        update: {
          walletType: 'external',
          provider: input.provider ?? 'browser_wallet',
          label: input.label ?? null,
          status: 'active',
          verifiedAt: new Date(),
          lastUsedAt: new Date(),
        },
        create: {
          userId: req.auth!.userId,
          chain: 'solana',
          walletAddress,
          walletType: 'external',
          provider: input.provider ?? 'browser_wallet',
          label: input.label ?? null,
          verifiedAt: new Date(),
          lastUsedAt: new Date(),
        },
      });
    });

    res.status(201).json(serializeUserWallet(wallet));
  } catch (error) {
    next(error);
  }
});

userWalletsRouter.post('/user-wallets/embedded', async (req, res, next) => {
  try {
    const input = registerEmbeddedWalletSchema.parse(req.body);
    const walletAddress = normalizeSolanaAddress(input.walletAddress);
    const wallet = await prisma.userWallet.upsert({
      where: {
        userId_chain_walletAddress: {
          userId: req.auth!.userId,
          chain: 'solana',
          walletAddress,
        },
      },
      update: {
        walletType: 'privy_embedded',
        provider: input.provider,
        providerWalletId: input.providerWalletId ?? null,
        label: input.label ?? null,
        status: 'active',
        verifiedAt: new Date(),
      },
      create: {
        userId: req.auth!.userId,
        chain: 'solana',
        walletAddress,
        walletType: 'privy_embedded',
        provider: input.provider,
        providerWalletId: input.providerWalletId ?? null,
        label: input.label ?? null,
        verifiedAt: new Date(),
      },
    });

    res.status(201).json(serializeUserWallet(wallet));
  } catch (error) {
    next(error);
  }
});

userWalletsRouter.post('/user-wallets/managed', async (req, res, next) => {
  try {
    const input = createManagedWalletSchema.parse(req.body);
    if (input.provider !== 'privy') {
      throw new ApiError(501, 'provider_not_supported', 'This wallet provider is not enabled yet.');
    }

    const createdWallet = await createPrivySolanaWallet({
      userId: req.auth!.userId,
      label: input.label ?? 'Privy signing wallet',
    });
    const walletAddress = normalizeSolanaAddress(createdWallet.address);

    const wallet = await prisma.userWallet.upsert({
      where: {
        userId_chain_walletAddress: {
          userId: req.auth!.userId,
          chain: 'solana',
          walletAddress,
        },
      },
      update: {
        walletType: 'privy_embedded',
        provider: 'privy',
        providerWalletId: createdWallet.providerWalletId,
        label: input.label ?? createdWallet.displayName ?? 'Privy signing wallet',
        status: 'active',
        verifiedAt: new Date(),
        metadataJson: createdWallet.metadata,
      },
      create: {
        userId: req.auth!.userId,
        chain: 'solana',
        walletAddress,
        walletType: 'privy_embedded',
        provider: 'privy',
        providerWalletId: createdWallet.providerWalletId,
        label: input.label ?? createdWallet.displayName ?? 'Privy signing wallet',
        verifiedAt: new Date(),
        metadataJson: createdWallet.metadata,
      },
    });

    res.status(201).json(serializeUserWallet(wallet));
  } catch (error) {
    next(error);
  }
});

function serializeUserWallet(wallet: {
  userWalletId: string;
  userId: string;
  chain: string;
  walletAddress: string;
  walletType: string;
  provider: string | null;
  providerWalletId: string | null;
  label: string | null;
  status: string;
  verifiedAt: Date | null;
  lastUsedAt: Date | null;
  metadataJson: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    userWalletId: wallet.userWalletId,
    userId: wallet.userId,
    chain: wallet.chain,
    walletAddress: wallet.walletAddress,
    walletType: wallet.walletType,
    provider: wallet.provider,
    providerWalletId: wallet.providerWalletId,
    label: wallet.label,
    status: wallet.status,
    verifiedAt: wallet.verifiedAt?.toISOString() ?? null,
    lastUsedAt: wallet.lastUsedAt?.toISOString() ?? null,
    metadataJson: wallet.metadataJson,
    createdAt: wallet.createdAt.toISOString(),
    updatedAt: wallet.updatedAt.toISOString(),
  };
}

async function createPrivySolanaWallet(input: { userId: string; label: string }) {
  if (!config.privyAppId || !config.privyAppSecret) {
    throw new ApiError(
      501,
      'provider_not_configured',
      'Privy wallet creation is not configured. Add PRIVY_APP_ID and PRIVY_APP_SECRET to api/.env.',
    );
  }

  const externalId = `decimal-user-${input.userId}`.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64);
  const response = await fetch(`${config.privyApiBaseUrl}/v1/wallets`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${config.privyAppId}:${config.privyAppSecret}`).toString('base64')}`,
      'content-type': 'application/json',
      'privy-app-id': config.privyAppId,
      'privy-idempotency-key': `user-wallet-${input.userId}`,
    },
    body: JSON.stringify({
      chain_type: 'solana',
      external_id: externalId,
      display_name: input.label,
    }),
  });

  const payload = await response.json().catch(() => null) as PrivyWalletResponse | null;
  if (!response.ok || !payload?.id || !payload.address) {
    throw new ApiError(
      response.status >= 400 && response.status < 500 ? 400 : 502,
      'privy_wallet_create_failed',
      extractPrivyErrorMessage(payload) ?? 'Privy could not create the wallet.',
      payload,
    );
  }

  return {
    providerWalletId: payload.id,
    address: payload.address,
    displayName: payload.display_name ?? null,
    metadata: {
      externalId: payload.external_id ?? externalId,
      chainType: payload.chain_type ?? 'solana',
      ownerId: payload.owner_id ?? null,
      createdAt: payload.created_at ?? null,
    },
  };
}

type PrivyWalletResponse = {
  id?: string;
  address?: string;
  display_name?: string | null;
  external_id?: string | null;
  chain_type?: string;
  owner_id?: string | null;
  created_at?: number;
  error?: string;
  message?: string;
};

function extractPrivyErrorMessage(payload: PrivyWalletResponse | null) {
  return payload?.message ?? payload?.error ?? null;
}

function normalizeSolanaAddress(value: string) {
  try {
    return new PublicKey(value.trim()).toBase58();
  } catch {
    throw badRequest('Invalid Solana wallet address.');
  }
}

function hashNonce(nonce: string) {
  return crypto.createHash('sha256').update(nonce).digest('hex');
}

function verifyEd25519Signature(walletAddress: string, message: Buffer, signature: Buffer) {
  if (signature.length !== 64) {
    return false;
  }

  const publicKeyBytes = new PublicKey(walletAddress).toBytes();
  const spki = Buffer.concat([
    Buffer.from('302a300506032b6570032100', 'hex'),
    Buffer.from(publicKeyBytes),
  ]);
  const publicKey = crypto.createPublicKey({
    key: spki,
    format: 'der',
    type: 'spki',
  });

  return crypto.verify(null, message, publicKey, signature);
}
