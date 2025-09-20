export interface JwtPayload {
  sub: string; // visitId
  name: string; // visitName
  gate: string; // allowed building
  max: number; // max uses
  jti: string; // JWT ID
  nbf: number; // not before
  exp: number; // expires
  iss: string; // issuer
  iat: number; // issued at
  kid?: string; // key id (optional)
  userId?: string; // optional user id
}
