import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../auth/dto/auth-response.dto';
import {
  AccessAuthGuard,
  AuthOriginGuard,
  getAuthenticatedUser,
} from '../../auth/http/auth-http-security';
import {
  getAuthorizedWorkspace,
  WorkspaceRoleGuard,
  WorkspaceRoles,
} from '../../workspaces/http/workspace-authorization';
import {
  ContractIdParamDto,
  ContractPageResponseDto,
  ContractQueryDto,
  ContractResponseDto,
  CreateContractRequestDto,
  EndContractRequestDto,
  UpdateContractRequestDto,
} from '../dto/contract.dto';
import { MyContractIdParamDto } from '../dto/contract.dto';
import { ContractService } from '../services/contract.service';

@ApiTags('Rental Contracts')
@ApiBearerAuth()
@UseGuards(AuthOriginGuard, AccessAuthGuard)
@Controller('workspaces/:workspaceId/contracts')
export class ContractController {
  constructor(private readonly service: ContractService) {}
  @Post()
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiCreatedResponse({ type: ContractResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  create(@Req() req: Request, @Body() input: CreateContractRequestDto) {
    return this.service.create(getAuthorizedWorkspace(req).id, getAuthenticatedUser(req).id, input);
  }
  @Get()
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOkResponse({ type: ContractPageResponseDto })
  list(@Req() req: Request, @Query() query: ContractQueryDto) {
    return this.service.list(getAuthorizedWorkspace(req).id, query);
  }
  @Get(':contractId')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOkResponse({ type: ContractResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  detail(@Req() req: Request, @Param() params: ContractIdParamDto) {
    return this.service.detail(getAuthorizedWorkspace(req).id, params.contractId);
  }
  @Patch(':contractId')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOkResponse({ type: ContractResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  update(
    @Req() req: Request,
    @Param() params: ContractIdParamDto,
    @Body() input: UpdateContractRequestDto,
  ) {
    return this.service.update(
      getAuthorizedWorkspace(req).id,
      getAuthenticatedUser(req).id,
      params.contractId,
      input,
    );
  }
  @Patch(':contractId/end')
  @UseGuards(WorkspaceRoleGuard)
  @WorkspaceRoles('OWNER')
  @ApiOkResponse({ type: ContractResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiHeader({ name: 'X-CSRF-Protection', required: true, example: '1' })
  end(
    @Req() req: Request,
    @Param() params: ContractIdParamDto,
    @Body() input: EndContractRequestDto,
  ) {
    return this.service.end(
      getAuthorizedWorkspace(req).id,
      getAuthenticatedUser(req).id,
      params.contractId,
      input,
    );
  }
}

@ApiTags('Tenant Contracts')
@ApiBearerAuth()
@UseGuards(AuthOriginGuard, AccessAuthGuard)
@Controller('contracts/me')
export class TenantContractController {
  constructor(private readonly service: ContractService) {}
  @Get()
  @ApiOkResponse({ type: ContractPageResponseDto })
  list(@Req() req: Request, @Query() query: ContractQueryDto) {
    return this.service.listForTenantUser(getAuthenticatedUser(req).id, query);
  }
  @Get(':contractId')
  @ApiOkResponse({ type: ContractResponseDto })
  detail(@Req() req: Request, @Param() params: MyContractIdParamDto) {
    return this.service.detailForTenantUser(getAuthenticatedUser(req).id, params.contractId);
  }
}
