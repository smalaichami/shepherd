import {
  BALANCER,
  balancerFlush,
  BalancerNetworkSwitchRequestedAction,
  BalancerQueueTimeoutAction,
  BalancerUnsetAmbientAction,
  BalancerSetAmbientSucceededAction,
} from '@src/ducks/providerBalancer/balancerConfig';
import { getWorkers, WorkerState } from '@src/ducks/providerBalancer/workers';
import { balancerChannel, providerChannels } from '@src/saga/channels';
import { SagaIterator } from 'redux-saga';
import {
  apply,
  call,
  cancel,
  put,
  select,
  takeEvery,
} from 'redux-saga/effects';

function* clearWorkers(): SagaIterator {
  const workers: WorkerState = yield select(getWorkers);
  for (const worker of Object.values(workers)) {
    yield cancel(worker.task);
  }
}

function* clearAllPendingCalls(): SagaIterator {
  yield apply(providerChannels, providerChannels.cancelPendingCalls);
  yield apply(balancerChannel, balancerChannel.cancelPendingCalls);
}

function* deleteProviderChannels() {
  yield apply(providerChannels, providerChannels.deleteAllChannels);
}

type FlushingActions =
  | BalancerQueueTimeoutAction
  | BalancerNetworkSwitchRequestedAction
  | BalancerSetAmbientSucceededAction
  | BalancerUnsetAmbientAction;

function* clearState({ type }: FlushingActions): SagaIterator {
  const isNetworkSwitch = type === BALANCER.NETWORK_SWTICH_REQUESTED;
  yield call(clearAllPendingCalls);

  if (isNetworkSwitch) {
    yield put(balancerFlush());
    yield call(clearWorkers);
    yield call(deleteProviderChannels);
  }
}

export const balancerFlushWatcher = [
  takeEvery(
    [
      BALANCER.NETWORK_SWTICH_REQUESTED,
      BALANCER.QUEUE_TIMEOUT,
      BALANCER.SET_AMBIENT_SUCCEEDED, // ideally this should only clear provider channels that have raw_tx in them
      BALANCER.UNSET_AMBIENT, // this should be only targeted towards the ambient provider's channel ideally
    ],
    clearState,
  ),
];
