import { Controller, Get, Post, Delete, Body, Param, Patch, HttpCode, HttpStatus } from '@nestjs/common';
import { UsersService } from './users.service';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '@appshore/db';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Get()
  async getAllUsers(@CurrentUser() currentUser: any) {
    return this.usersService.getAllUsers(currentUser.tenantId, currentUser);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Get(':user_id')
  async getUser(@Param('user_id') userId: string, @CurrentUser() currentUser: any) {
    return this.usersService.getUser(userId, currentUser.tenantId);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createUser(@Body() dto: CreateUserDto, @CurrentUser() currentUser: any) {
    return this.usersService.createUser(dto, currentUser.tenantId);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Patch(':user_id')
  async updateUser(@Param('user_id') userId: string, @Body() dto: UpdateUserDto, @CurrentUser() currentUser: any) {
    return this.usersService.updateUser(userId, dto, currentUser.tenantId, currentUser);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Delete(':user_id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteUser(@Param('user_id') userId: string, @CurrentUser() currentUser: any): Promise<void> {
    await this.usersService.deleteUser(userId, currentUser.tenantId, currentUser);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Post(':user_id/deactivate')
  @HttpCode(HttpStatus.OK)
  async deactivateUser(@Param('user_id') userId: string, @CurrentUser() currentUser: any) {
    return this.usersService.toggleUserStatus(userId, false, currentUser.tenantId, currentUser);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Post(':user_id/activate')
  @HttpCode(HttpStatus.OK)
  async activateUser(@Param('user_id') userId: string, @CurrentUser() currentUser: any) {
    return this.usersService.toggleUserStatus(userId, true, currentUser.tenantId, currentUser);
  }
}
