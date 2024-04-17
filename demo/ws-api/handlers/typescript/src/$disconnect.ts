/*! Copyright [Amazon.com](http://amazon.com/), Inc. or its affiliates. All Rights Reserved.
PDX-License-Identifier: Apache-2.0 */
import {
  $disconnectHandler,
  $DisconnectChainedLambdaHandlerFunction,
  INTERCEPTORS,
  LoggingInterceptor,
} from 'ws-api-typescript-runtime';

/**
 * Type-safe handler for the $disconnect event, invoked when a client disconnects from the websocket
 */
export const $disconnect: $DisconnectChainedLambdaHandlerFunction = async (request) => {
  LoggingInterceptor.getLogger(request).info('Start $disconnect');

  // `connectionId` is the ID of the connection which has ended
  // `sdk` is used to send messages to connected clients
  const { connectionId, sdk } = request;

  // TODO: Implement
};

/**
 * Entry point for the AWS Lambda handler for the $disconnect event.
 * The $disconnectHandler method wraps the type-safe handler and manages marshalling inputs
 */
export const handler = $disconnectHandler(...INTERCEPTORS, $disconnect);
