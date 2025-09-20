export class AccessNotReleasedException extends Error {
  constructor(message = 'Acesso ainda não liberado') {
    super(message);
    this.name = 'AccessNotReleasedException';
  }
}

export class AccessExpiredException extends Error {
  constructor(message = 'Acesso expirado') {
    super(message);
    this.name = 'AccessExpiredException';
  }
}

export class InvalidQrCodeException extends Error {
  constructor(message = 'QR Code inválido') {
    super(message);
    this.name = 'InvalidQrCodeException';
  }
}

export class GateNotAuthorizedException extends Error {
  constructor(message = 'Portão não autorizado para este acesso') {
    super(message);
    this.name = 'GateNotAuthorizedException';
  }
}

export class QrCodeAlreadyUsedException extends Error {
  constructor(message = 'QR Code já foi utilizado') {
    super(message);
    this.name = 'QrCodeAlreadyUsedException';
  }
}

export class AccessDeniedException extends Error {
  constructor(message = 'Acesso negado') {
    super(message);
    this.name = 'AccessDeniedException';
  }
}
