/*! Copyright [Amazon.com](http://amazon.com/), Inc. or its affiliates. All Rights Reserved.
PDX-License-Identifier: Apache-2.0 */
import {
  subscribeToNotificationsHandler,
  SubscribeToNotificationsChainedHandlerFunction,
  INTERCEPTORS,
  LoggingInterceptor,
} from 'wsApi-typescript-runtime';

/**
 * Type-safe handler for the SubscribeToNotifications operation
 */
export const subscribeToNotifications: SubscribeToNotificationsChainedHandlerFunction = async (request) => {
  LoggingInterceptor.getLogger(request).info('Start SubscribeToNotifications Operation');

  // `input` contains the request input
  // `connectionId` is the ID of the connection which sent this request to the server.
  // `sdk` is used to send messages to connected clients
  const { input, connectionId, sdk } = request;

  // TODO: Implement SubscribeToNotifications Operation.
};

/**
 * Entry point for the AWS Lambda handler for the SubscribeToNotifications operation.
 * The subscribeToNotificationsHandler method wraps the type-safe handler and manages marshalling inputs
 */
export const handler = subscribeToNotificationsHandler(...INTERCEPTORS, subscribeToNotifications);
