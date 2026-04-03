import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { WaveService } from './wave.service';
import { AdminService } from 'src/admin/admin.service';

interface SubmitFlowDto {
    betAmount: number;
    type: number; // 1 = deduct, 2 = add
    transactionId: string;
}
class AppKeyDto {
    appKey: string;
}
@ApiTags('Wave')
@Controller('wave')
export class WaveController {
    constructor(private readonly waveService: WaveService, private readonly adminservice: AdminService) { }
    @Get('/game/userInfo')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Fetch user info by token' })
    @ApiResponse({
        status: 200,
        description: 'User info returned successfully',
        example: {
            success: true,
            message: 'User info fetched successfully',
            data: {
                id: 101,
                name: "John Doe",
                balance: 5400,
                profilePicture: "https://randomuser.me/api/portraits/men/75.jpg"
            }
        }
    })
    async gameUserInfo(@Headers('authorization') authHeader: string) {
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return {
                success: false,
                message: "Missing or invalid token",
                data: null
            };
        }

        const token = authHeader.split(' ')[1];

        // Validate token via service
        const user = await this.adminservice.validateUserToken(token);

        if (!user) {
            return {
                success: false,
                message: "Invalid token or user not found",
                data: null
            };
        }

        return {
            success: true,
            message: "User info fetched successfully",
            data: user
        };
    }

    @Post('/game/submitFlow')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Submit game flow and update user balance' })
    async gameSubmitFlow(
        @Headers('authorization') authHeader: string,
        @Body() body: SubmitFlowDto,
    ) {
        if (!authHeader?.startsWith('Bearer ')) {
            return { success: false, message: 'Missing or invalid token', data: null };
        }

        const token = authHeader.split(' ')[1];
        const user = await this.adminservice.validateUserToken(token);
        let userBalance = user.balance;
        if (!user) {
            return { success: false, message: 'Invalid token or user not found', data: null };
        }
        const { betAmount, type, transactionId } = body;
        if (userBalance < betAmount) {
            return { success: false, message: 'Not enough balance.', data: user };
        }
        let newBalance = userBalance;
        // Update balance
        if (type === 1) {
            newBalance = userBalance - betAmount;
        } else if (type === 2) {
            newBalance = userBalance + betAmount;

        }
        user.balance = newBalance;
        return {
            success: true,
            message: 'User info fetched successfully',
            data: user,
        };
    }
}
