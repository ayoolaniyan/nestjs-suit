import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { DatabaseModule, LoggerModule, Role, User } from '@app/common';
import { UsersRepository } from './users.repository';
import { authDatabaseOptions } from '../database/database.options';

@Module({
  imports: [
    DatabaseModule.forRoot(authDatabaseOptions),
    DatabaseModule.forFeature([User, Role]),
    LoggerModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService],
})
export class UsersModule {}
