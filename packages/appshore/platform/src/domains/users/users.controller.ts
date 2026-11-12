import { Controller, Get, Post, Delete, Body, Param, Patch, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { UsersService } from './users.service';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '@appshore/db';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserListQueryDto } from './dto/user-list-query.dto';
import { ApiNoContentResponse, ApiOperation, ApiParam } from '@nestjs/swagger';
import { ApiResult } from '../../shared/openapi/api-result';
import { UserDetailResponse, UserListResponseRef, UserSavedResponse } from './openapi.responses';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Get()
  @ApiOperation({ summary: "List the tenant's users — cursor-paged (OWNER/ADMIN)" })
  @ApiResult(UserListResponseRef)
  async getAllUsers(@CurrentUser() currentUser: any, @Query() query: UserListQueryDto) {
    return this.usersService.listUsers(currentUser.tenantId, query);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Get(':user_id')
  @ApiOperation({ summary: "A user of the tenant (OWNER/ADMIN); another tenant's user is a 404" })
  @ApiParam({ name: 'user_id', description: 'User public id (user_…)' })
  @ApiResult(UserDetailResponse)
  async getUser(@Param('user_id') userId: string, @CurrentUser() currentUser: any) {
    return this.usersService.getUser(userId, currentUser.tenantId);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a user in the tenant without a password — they set one through an invitation (OWNER/ADMIN)',
  })
  @ApiResult(UserSavedResponse, HttpStatus.CREATED)
  async createUser(@Body() dto: CreateUserDto, @CurrentUser() currentUser: any) {
    return this.usersService.createUser(dto, currentUser.tenantId);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Patch(':user_id')
  @ApiOperation({
    summary: "Update a user's name, role or active flag (OWNER/ADMIN) — 403 on the owner, own role, or admin rules",
  })
  @ApiParam({ name: 'user_id', description: 'User public id (user_…)' })
  @ApiResult(UserSavedResponse)
  async updateUser(@Param('user_id') userId: string, @Body() dto: UpdateUserDto, @CurrentUser() currentUser: any) {
    return this.usersService.updateUser(userId, dto, currentUser.tenantId, currentUser);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Delete(':user_id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a user — soft: deactivates the account (OWNER/ADMIN); 403 on the owner' })
  @ApiParam({ name: 'user_id', description: 'User public id (user_…)' })
  @ApiNoContentResponse({ description: 'The user is deleted' })
  async deleteUser(@Param('user_id') userId: string, @CurrentUser() currentUser: any): Promise<void> {
    await this.usersService.deleteUser(userId, currentUser.tenantId, currentUser);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Post(':user_id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a user — they can no longer sign in (OWNER/ADMIN)' })
  @ApiParam({ name: 'user_id', description: 'User public id (user_…)' })
  @ApiResult(UserDetailResponse)
  async deactivateUser(@Param('user_id') userId: string, @CurrentUser() currentUser: any) {
    return this.usersService.toggleUserStatus(userId, false, currentUser.tenantId, currentUser);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Post(':user_id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivate a deactivated user (OWNER/ADMIN)' })
  @ApiParam({ name: 'user_id', description: 'User public id (user_…)' })
  @ApiResult(UserDetailResponse)
  async activateUser(@Param('user_id') userId: string, @CurrentUser() currentUser: any) {
    return this.usersService.toggleUserStatus(userId, true, currentUser.tenantId, currentUser);
  }
}
