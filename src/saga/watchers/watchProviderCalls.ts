import {
  BALANCER,
  balancerQueueTimeout,
} from '@src/ducks/providerBalancer/balancerConfig';
import { isOffline } from '@src/ducks/providerBalancer/balancerConfig/selectors';
import {
  providerCallFailed,
  ProviderCallRequestedAction,
} from '@src/ducks/providerBalancer/providerCalls';
import { getAvailableProviderId } from '@src/ducks/selectors';
import { balancerChannel, providerChannels } from '@src/saga/channels';
import { delay, SagaIterator } from 'redux-saga';
import { apply, call, fork, put, race, select, take } from 'redux-saga/effects';

function* getOptimalProviderId(
  payload: ProviderCallRequestedAction['payload'],
): SagaIterator {
  // check if the app is offline
  if (yield select(isOffline)) {
    console.log('waiting for online');
    yield take(BALANCER.ONLINE); // wait until its back online
    console.log('online');
  }

  // get an available providerId to put the action to the channel
  const providerId: string | null = yield select(
    getAvailableProviderId,
    payload,
  );

  if (!providerId) {
    // TODO: seperate this into a different action
    console.error(`no provider id found for ${payload.callId}`);

    const action = providerCallFailed({
      providerCall: { ...payload, providerId: 'SHEPHERD' },
      error: 'No available provider found',
    });
    yield put(action);
    return undefined;
  }

  return providerId;
}

function* handleRequest(): SagaIterator {
  yield apply(balancerChannel, balancerChannel.init);

  while (true) {
    // test if this starts queue timeout
    const action: ProviderCallRequestedAction = yield apply(
      balancerChannel,
      balancerChannel.take,
    );

    function* process() {
      const { payload } = action;
      const providerId: string | undefined = yield call(
        getOptimalProviderId,
        payload,
      );

      if (providerId) {
        yield apply(providerChannels, providerChannels.put, [
          providerId,
          action,
        ]);
      }

      balancerChannel.done();
    }

    const { queueTimeout } = yield race({
      processed: call(process),
      queueTimeout: call(delay, 5000),
    });

    if (queueTimeout) {
      yield put(balancerQueueTimeout());
    }
  }
}

export const providerRequestWatcher = [fork(handleRequest)];
