import { expect } from 'chai';
import { EventEmitter } from 'events';
import { EMPTY } from 'rxjs';
import * as sinon from 'sinon';
import { ClientRMQ } from '../../client/client-rmq';
import { ReadPacket, RmqExchangeOptions } from '../../interfaces';
import { RmqRecord } from '../../record-builders';

describe('ClientRMQ', function () {
  this.retries(10);

  let client: ClientRMQ;

  describe('connect', () => {
    let createClientStub: sinon.SinonStub;
    let handleErrorsSpy: sinon.SinonSpy;
    let connect$Stub: sinon.SinonStub;
    let mergeDisconnectEvent: sinon.SinonStub;

    beforeEach(async () => {
      client = new ClientRMQ({});
      createClientStub = sinon.stub(client, 'createClient').callsFake(() => ({
        addListener: () => ({}),
        removeListener: () => ({}),
      }));
      handleErrorsSpy = sinon.spy(client, 'handleError');
      connect$Stub = sinon.stub(client, 'connect$' as any).callsFake(() => ({
        subscribe: resolve => resolve(),
        toPromise() {
          return this;
        },
        pipe() {
          return this;
        },
      }));
      mergeDisconnectEvent = sinon
        .stub(client, 'mergeDisconnectEvent')
        .callsFake((_, source) => source);
    });
    describe('when is not connected', () => {
      beforeEach(async () => {
        try {
          client['client'] = null;
          await client.connect();
        } catch {}
      });
      it('should call "handleError" once', async () => {
        expect(handleErrorsSpy.called).to.be.true;
      });
      it('should call "createClient" once', async () => {
        expect(createClientStub.called).to.be.true;
      });
      it('should call "connect$" once', async () => {
        expect(connect$Stub.called).to.be.true;
      });
    });
    describe('when is connected', () => {
      beforeEach(() => {
        client['client'] = { test: true } as any;
        client['channel'] = { test: true };
      });
      it('should not call "createClient"', () => {
        expect(createClientStub.called).to.be.false;
      });
      it('should not call "handleError"', () => {
        expect(handleErrorsSpy.called).to.be.false;
      });
      it('should not call "connect$"', () => {
        expect(connect$Stub.called).to.be.false;
      });
    });
  });

  describe('createChannel', () => {
    let createChannelStub: sinon.SinonStub;
    let setupChannelStub: sinon.SinonStub;

    beforeEach(() => {
      setupChannelStub = sinon
        .stub(client, 'setupChannel')
        .callsFake((_, done) => done());
      createChannelStub = sinon.stub().callsFake(({ setup }) => setup());
      client['client'] = { createChannel: createChannelStub };
    });
    afterEach(() => {
      setupChannelStub.restore();
    });
    it('should call "createChannel" method of the client instance', async () => {
      await client.createChannel();
      expect(createChannelStub.called).to.be.true;
    });
    it('should call "setupChannel" method of the client instance', async () => {
      await client.createChannel();
      expect(setupChannelStub.called).to.be.true;
    });
  });

  describe('consumeChannel', () => {
    let consumeStub: sinon.SinonStub;
    const channel: any = {};

    beforeEach(() => {
      client['responseEmitter'] = new EventEmitter();
      consumeStub = sinon
        .stub()
        .callsFake((_, done) => done({ properties: { correlationId: 1 } }));

      channel.consume = consumeStub;
    });
    it('should call "consume" method of the channel instance', async () => {
      await client.consumeChannel(channel);
      expect(consumeStub.called).to.be.true;
    });
  });

  describe('setupChannel', () => {
    const queue = 'test';
    const queueOptions = {};
    const isGlobalPrefetchCount = true;
    const prefetchCount = 10;
    const exchange: RmqExchangeOptions = {
      name: 'string',
      routingKey: 'string',
      type: 'fanout',
      echangeOpts: {},
    };
    let consumeStub: sinon.SinonStub;
    let channel: any = {};

    beforeEach(() => {
      client['queue'] = queue;
      client['queueOptions'] = queueOptions;
      client['exchange'] = null;
      (client as any)['options'] = { isGlobalPrefetchCount, prefetchCount };

      channel = {
        assertQueue: sinon.spy(() => ({})),
        prefetch: sinon.spy(),
        assertExchange: sinon.spy(() => ({})),
        bindQueue: sinon.spy(() => ({})),
      };
      consumeStub = sinon.stub(client, 'consumeChannel').callsFake(() => null);
    });
    afterEach(() => {
      consumeStub.restore();
    });
    it('should call "assertQueue" with queue and queue options', async () => {
      await client.setupChannel(channel, () => null);
      expect(channel.assertQueue.calledWith(queue, queueOptions)).to.be.true;
    });
    it('should call "assertExchange" if with exchange option is set and with exchange options', async () => {
      client['exchange'] = exchange;
      await client.setupChannel(channel, () => null);
      expect(
        channel.assertExchange.calledWith(
          exchange.name,
          exchange.type,
          exchange.echangeOpts,
        ),
      ).to.be.true;
    });
    it('should call "bindQueue" if with exchange and queue option is set and with exchange options', async () => {
      client['exchange'] = exchange;
      await client.setupChannel(channel, () => null);
      expect(
        channel.bindQueue.calledWith(queue, exchange.name, exchange.routingKey),
      ).to.be.true;
    });
    it('should call "prefetch" with prefetchCount and "isGlobalPrefetchCount"', async () => {
      await client.setupChannel(channel, () => null);
      expect(channel.prefetch.calledWith(prefetchCount, isGlobalPrefetchCount))
        .to.be.true;
    });
    it('should call "consumeChannel" method', async () => {
      await client.setupChannel(channel, () => null);
      expect(consumeStub.called).to.be.true;
    });
    it('should call "resolve" function', async () => {
      const resolve = sinon.spy();
      await client.setupChannel(channel, resolve);
      expect(resolve.called).to.be.true;
    });
  });

  describe('mergeDisconnectEvent', () => {
    it('should merge disconnect event', () => {
      const error = new Error();
      const instance: any = {
        on: (ev, callback) => callback(error),
        off: () => ({}),
      };
      client
        .mergeDisconnectEvent(instance as any, EMPTY)
        .subscribe({ error: (err: any) => expect(err).to.be.eql(error) });
    });
  });

  describe('publish', () => {
    const pattern = 'test';
    let msg: ReadPacket;
    let connectSpy: sinon.SinonSpy,
      sendToQueueSpy: sinon.SinonSpy,
      eventSpy: sinon.SinonSpy;

    beforeEach(() => {
      client = new ClientRMQ({});
      msg = { pattern, data: 'data' };
      connectSpy = sinon.spy(client, 'connect');
      eventSpy = sinon.spy();
      sendToQueueSpy = sinon.spy();

      client['channel'] = {
        sendToQueue: sendToQueueSpy,
      };
      client['responseEmitter'] = new EventEmitter();
      client['responseEmitter'].on(pattern, eventSpy);
    });

    afterEach(() => {
      connectSpy.restore();
    });

    it('should send message to a proper queue', () => {
      client['publish'](msg, () => {
        expect(sendToQueueSpy.called).to.be.true;
        expect(sendToQueueSpy.getCall(0).args[0]).to.be.eql(client['queue']);
      });
    });

    it('should send buffer from stringified message', () => {
      client['publish'](msg, () => {
        expect(sendToQueueSpy.called).to.be.true;
        expect(sendToQueueSpy.getCall(1).args[1]).to.be.eql(
          Buffer.from(JSON.stringify(msg)),
        );
      });
    });

    describe('dispose callback', () => {
      let unsubscribeSpy: sinon.SinonSpy, subscription;

      beforeEach(async () => {
        unsubscribeSpy = sinon.spy();
        client['responseEmitter'] = {
          removeListener: unsubscribeSpy,
          on: sinon.spy(),
        } as any as EventEmitter;

        subscription = await client['publish'](msg, sinon.spy());
        subscription();
      });
      it('should unsubscribe', () => {
        expect(unsubscribeSpy.called).to.be.true;
      });
    });

    describe('headers', () => {
      it('should not generate headers if none are configured', () => {
        client['publish'](msg, () => {
          expect(sendToQueueSpy.getCall(0).args[2].headers).to.be.undefined;
        });
      });

      it('should send packet headers', () => {
        const requestHeaders = { '1': '123' };
        msg.data = new RmqRecord('data', { headers: requestHeaders });

        client['publish'](msg, () => {
          expect(sendToQueueSpy.getCall(0).args[2].headers).to.eql(
            requestHeaders,
          );
        });
      });

      it('should combine packet and static headers', () => {
        const staticHeaders = { 'client-id': 'some-client-id' };
        (client as any).options.headers = staticHeaders;

        const requestHeaders = { '1': '123' };
        msg.data = new RmqRecord('data', { headers: requestHeaders });

        client['publish'](msg, () => {
          expect(sendToQueueSpy.getCall(0).args[2].headers).to.eql({
            ...staticHeaders,
            ...requestHeaders,
          });
        });
      });

      it('should prefer packet headers over static headers', () => {
        const staticHeaders = { 'client-id': 'some-client-id' };
        (client as any).options.headers = staticHeaders;

        const requestHeaders = { 'client-id': 'override-client-id' };
        msg.data = new RmqRecord('data', { headers: requestHeaders });

        client['publish'](msg, () => {
          expect(sendToQueueSpy.getCall(0).args[2].headers).to.eql(
            requestHeaders,
          );
        });
      });
    });
  });

  describe('handleMessage', () => {
    describe('when error', () => {
      let callback: sinon.SinonSpy;

      beforeEach(() => {
        callback = sinon.spy();
      });
      it('should call callback with correct object', async () => {
        const packet = {
          err: true,
          response: 'test',
          isDisposed: false,
        };
        await client.handleMessage(packet, callback);
        expect(
          callback.calledWith({
            err: packet.err,
            response: 'test',
            isDisposed: true,
          }),
        ).to.be.true;
      });
    });
    describe('when disposed', () => {
      let callback: sinon.SinonSpy;

      beforeEach(() => {
        callback = sinon.spy();
      });
      it('should call callback with correct object', async () => {
        const packet = {
          response: 'test',
          isDisposed: true,
        };
        await client.handleMessage(packet, callback);
        expect(
          callback.calledWith({
            err: undefined,
            response: 'test',
            isDisposed: true,
          }),
        ).to.be.true;
      });
    });

    describe('when response', () => {
      let callback: sinon.SinonSpy;

      beforeEach(() => {
        callback = sinon.spy();
      });
      it('should call callback with correct object', async () => {
        const packet = {
          response: 'test',
          isDisposed: false,
        };
        await client.handleMessage(packet, callback);
        expect(
          callback.calledWith({
            err: undefined,
            response: packet.response,
          }),
        ).to.be.true;
      });
    });
  });

  describe('close', () => {
    let channelCloseSpy: sinon.SinonSpy;
    let clientCloseSpy: sinon.SinonSpy;
    beforeEach(() => {
      channelCloseSpy = sinon.spy();
      clientCloseSpy = sinon.spy();
      (client as any).channel = { close: channelCloseSpy };
      (client as any).client = { close: clientCloseSpy };
    });

    it('should close channel when it is not null', () => {
      client.close();
      expect(channelCloseSpy.called).to.be.true;
    });

    it('should close client when it is not null', () => {
      client.close();
      expect(clientCloseSpy.called).to.be.true;
    });
  });
  describe('dispatchEvent', () => {
    let msg: ReadPacket;
    let sendToQueueStub: sinon.SinonStub, channel;
    let publishStub: sinon.SinonStub;
    const exchange: RmqExchangeOptions = {
      name: 'string',
      routingKey: 'string',
      type: 'fanout',
      echangeOpts: {},
    };

    beforeEach(() => {
      client = new ClientRMQ({});
      msg = { pattern: 'pattern', data: 'data' };
      sendToQueueStub = sinon.stub();
      publishStub = sinon.stub();
      channel = {
        sendToQueue: sendToQueueStub,
        publish: publishStub,
      };
      (client as any).channel = channel;

      sendToQueueStub.callsFake((a, b, c, d) => d());
      publishStub.callsFake((a, b, c, d, e) => e());
    });

    it('should publish packet with sendToQueue without exchange setting', async () => {
      await client['dispatchEvent'](msg);
      expect(sendToQueueStub.called).to.be.true;
    });
    it('should not publish packet with sendToQueue with exchange setting', async () => {
      client['exchange'] = exchange;
      await client['dispatchEvent'](msg);
      expect(sendToQueueStub.called).to.be.false;
    });
    it('should publish packet with publish with exchange setting', async () => {
      client['exchange'] = exchange;
      await client['dispatchEvent'](msg);
      expect(publishStub.called).to.be.true;
    });
    it('should throw error', async () => {
      sendToQueueStub.callsFake((a, b, c, d) => d(new Error()));
      client['dispatchEvent'](msg).catch(err =>
        expect(err).to.be.instanceOf(Error),
      );
    });

    describe('headers', () => {
      it('should not generate headers if none are configured', async () => {
        sendToQueueStub.callsFake((a, b, c, d) => d());
        await client['dispatchEvent'](msg);
        expect(sendToQueueStub.getCall(0).args[2].headers).to.be.undefined;
      });

      it('should send packet headers', async () => {
        sendToQueueStub.callsFake((a, b, c, d) => d());
        const requestHeaders = { '1': '123' };
        msg.data = new RmqRecord('data', { headers: requestHeaders });

        await client['dispatchEvent'](msg);
        expect(sendToQueueStub.getCall(0).args[2].headers).to.eql(
          requestHeaders,
        );
      });

      it('should combine packet and static headers', async () => {
        sendToQueueStub.callsFake((a, b, c, d) => d());
        const staticHeaders = { 'client-id': 'some-client-id' };
        (client as any).options.headers = staticHeaders;

        const requestHeaders = { '1': '123' };
        msg.data = new RmqRecord('data', { headers: requestHeaders });

        await client['dispatchEvent'](msg);
        expect(sendToQueueStub.getCall(0).args[2].headers).to.eql({
          ...staticHeaders,
          ...requestHeaders,
        });
      });

      it('should prefer packet headers over static headers', async () => {
        sendToQueueStub.callsFake((a, b, c, d) => d());
        const staticHeaders = { 'client-id': 'some-client-id' };
        (client as any).options.headers = staticHeaders;

        const requestHeaders = { 'client-id': 'override-client-id' };
        msg.data = new RmqRecord('data', { headers: requestHeaders });

        await client['dispatchEvent'](msg);
        expect(sendToQueueStub.getCall(0).args[2].headers).to.eql(
          requestHeaders,
        );
      });
    });
  });
});
