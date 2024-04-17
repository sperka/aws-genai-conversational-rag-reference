/*! Copyright [Amazon.com](http://amazon.com/), Inc. or its affiliates. All Rights Reserved.
PDX-License-Identifier: Apache-2.0 */
import {
  sendChatMessageHandler,
  SendChatMessageChainedHandlerFunction,
  INTERCEPTORS,
  LoggingInterceptor,
} from 'ws-api-typescript-runtime';

/**
 * Type-safe handler for the SendChatMessage operation
 */
export const sendChatMessage: SendChatMessageChainedHandlerFunction = async (request) => {
  const logger = LoggingInterceptor.getLogger(request);

  logger.info('Start SendChatMessage Operation');

  // `input` contains the request input
  // `connectionId` is the ID of the connection which sent this request to the server.
  // `sdk` is used to send messages to connected clients
  const { input, connectionId, sdk } = request;

  logger.info('input', { message: JSON.stringify(input) });

  // TODO: Implement SendChatMessage Operation.
  await sdk.updateInferenceStatus(connectionId, {
    chatId: input.chatId,
    messageId: 'NEW_MESSAGE_ID',
    operation: 'chat-message-create',
    status: 'SUCCESS',
  });
  await sdk.updateInferenceStatus(connectionId, {
    chatId: input.chatId,
    messageId: 'NEW_MESSAGE_ID',
    operation: 'data-search',
    status: 'FINISHED',
  });
};

/**
 * Entry point for the AWS Lambda handler for the SendChatMessage operation.
 * The sendChatMessageHandler method wraps the type-safe handler and manages marshalling inputs
 */
export const handler = sendChatMessageHandler(...INTERCEPTORS, sendChatMessage);
