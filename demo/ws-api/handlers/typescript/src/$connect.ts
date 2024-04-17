/*! Copyright [Amazon.com](http://amazon.com/), Inc. or its affiliates. All Rights Reserved.
PDX-License-Identifier: Apache-2.0 */
import {
  $connectHandler,
  $ConnectChainedLambdaHandlerFunction,
  INTERCEPTORS,
  LoggingInterceptor,
  $PendingConnection,
} from 'ws-api-typescript-runtime';

/**
 * Type-safe handler for the $connect event, invoked when a new client connects to the websocket
 */
export const $connect: $ConnectChainedLambdaHandlerFunction = async (request) => {
  LoggingInterceptor.getLogger(request).info('Start $connect');

  // `connectionId` is the ID of the new connection
  // `sdk` is used to send messages to connected clients
  // Note that you cannot send messages to the new connection until after this function returns
  const { connectionId, sdk } = request;

  // TODO: Implement

  // Use the below to allow or deny the incoming connection (when the lambda returns).
  // The connection is allowed by default.
  $PendingConnection.of(request).allow();
};

/**
 * Entry point for the AWS Lambda handler for the $connect event.
 * The $connectHandler method wraps the type-safe handler and manages marshalling inputs
 */
export const handler = $connectHandler(...INTERCEPTORS, $connect);
