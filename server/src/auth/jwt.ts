import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error('JWT_SECRET is not set');
const secret: string = SECRET;

export type TokenPayload = {
  accountId: string;
  role: 'RESIDENT' | 'ACCOUNTANT' | 'ADMIN';
  unitId: string | null;
};

export function signToken(payload: TokenPayload) {
  return jwt.sign(payload, secret, { expiresIn: '7d' });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, secret) as unknown as TokenPayload;
}
