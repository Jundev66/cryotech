import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentCompanyId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.companyId;
  },
);
