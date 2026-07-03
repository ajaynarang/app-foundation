import { Controller, Get, Post, Delete, Body, Param, Patch } from '@nestjs/common';
import { UsersService } from './users.service';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
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
  @Get(':userId')
  async getUser(@Param('userId') userId: string, @CurrentUser() currentUser: any) {
    return this.usersService.getUser(userId, currentUser.tenantId);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Post()
  async createUser(@Body() dto: CreateUserDto, @CurrentUser() currentUser: any) {
    return this.usersService.createUser(dto, currentUser.tenantId);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Patch(':userId')
  async updateUser(@Param('userId') userId: string, @Body() dto: UpdateUserDto, @CurrentUser() currentUser: any) {
    return this.usersService.updateUser(userId, dto, currentUser.tenantId, currentUser);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Delete(':userId')
  async deleteUser(@Param('userId') userId: string, @CurrentUser() currentUser: any) {
    return this.usersService.deleteUser(userId, currentUser.tenantId, currentUser);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Post(':userId/deactivate')
  async deactivateUser(@Param('userId') userId: string, @CurrentUser() currentUser: any) {
    return this.usersService.toggleUserStatus(userId, false, currentUser.tenantId, currentUser);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Post(':userId/activate')
  async activateUser(@Param('userId') userId: string, @CurrentUser() currentUser: any) {
    return this.usersService.toggleUserStatus(userId, true, currentUser.tenantId, currentUser);
  }
}
