import {
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UsersRepository } from './users.repository';
import * as bcrypt from 'bcryptjs';
import { GetUserDto } from './dto/get-user.dto';
import { User } from '@app/common';

// A bcrypt hash (cost 10, same as real ones) of a random value nobody knows,
// compared against when no user matches so the miss costs the same as a hit.
const TIMING_SAFE_DUMMY_HASH =
  '$2a$10$l2JpK0.iQ/I8kAs4ekVP1u7LWYtduwWGseApsJVxa4BoPq0XRbAlS';

@Injectable()
export class UsersService {
  constructor(private readonly userRepository: UsersRepository) {}

  async create(createUserDto: CreateUserDto) {
    await this.validateCreateUser(createUserDto);

    // Fields are picked explicitly rather than spread so that nothing the
    // caller sends beyond the DTO — roles in particular — reaches the entity.
    const user = new User({
      email: createUserDto.email,
      password: await bcrypt.hash(createUserDto.password, 10),
    });

    return this.userRepository.create(user);
  }

  private async validateCreateUser(createUserDto: CreateUserDto) {
    if (await this.userRepository.exists({ email: createUserDto.email })) {
      throw new UnprocessableEntityException('Email already exists.');
    }
  }

  async verifyUser(email: string, password: string) {
    const user = await this.userRepository.findOneOrNull({ email });
    // An unknown email and a wrong password must be indistinguishable, in the
    // error and in the time taken, or login can be used to discover which
    // emails have accounts. Hence the comparison runs either way.
    const passwordIsValid = await bcrypt.compare(
      password,
      user?.password ?? TIMING_SAFE_DUMMY_HASH,
    );
    if (!user || !passwordIsValid) {
      throw new UnauthorizedException('Credentials are not valid');
    }
    return user;
  }

  async getUser(getUserDto: GetUserDto) {
    return this.userRepository.findOne(getUserDto);
  }

  async getUsers(getUserDto: GetUserDto) {
    return this.userRepository.find(getUserDto);
  }
}
