/*! Copyright [Amazon.com](http://amazon.com/), Inc. or its affiliates. All Rights Reserved.
PDX-License-Identifier: Apache-2.0 */
import { BaseLanguageModel } from 'langchain/base_language';
import { CallbackManagerForChainRun } from 'langchain/callbacks';
import { BaseChain, ChainInputs, LLMChain, QAChainParams, StuffDocumentsChain } from 'langchain/chains';
import { PromptTemplate } from 'langchain/prompts';
import { ChainValues } from 'langchain/schema';
import { BaseRetriever } from 'langchain/schema/retriever';
import { ChainLLMCallStatus, ChainOperation, ChatEngineCallbacks, UpdateStatusCallbackOptions } from './callback.js';
import { ResolvedLLMChainConfig } from './config/index.js';
import { getLogger } from '../common/index.js';
import { startPerfMetric } from '../common/metrics/index.js';
import { PojoOutputParser } from '../langchain/output_parsers/pojo.js';

const logger = getLogger('chat/chain');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LoadValues = Record<string, any>;

export interface ChatEngineChainInput extends ChainInputs {
  retriever: BaseRetriever;
  /**
   * Classify chain for adaptive chain (classification, category, language, etc.)
   * which outputs JSON config proved to following chain inputs
   */
  classifyChain?: LLMChain;
  /**
   * Primary Question/Answer chain that provides the final answer generation to the user.
   */
  qaChain: BaseChain;
  /**
   * Followup question generator chain which condenses followup question based on chat history
   * into a standalone question which is provided to the QA chain.
   */
  condenseQuestionChain: LLMChain;
  returnSourceDocuments?: boolean;
  engineCallbacks?: ChatEngineCallbacks;
  useStreaming?: boolean;
  inputKey?: string;
}

export type ChatEngineChainFromInput = {
  returnSourceDocuments?: boolean;
  retriever: BaseRetriever;
  classifyChain?: {
    llm: BaseLanguageModel;
    prompt: PromptTemplate;
    /** Key to use for output, default to "classification" */
    outputKey?: string;
  };
  condenseQuestionChain: {
    llm: BaseLanguageModel;
    prompt: PromptTemplate;
  };
  qaChain: {
    // TODO: support other combine document types, we need to implement templates + adapters?
    type: 'stuff';
    llm: BaseLanguageModel;
    prompt: PromptTemplate;
  };
} & Omit<
  ChatEngineChainInput,
  'retriever' | 'combineDocumentsChain' | 'qaChain' | 'classifyChain' | 'condenseQuestionChain'
>;

export class ChatEngineChain extends BaseChain implements ChatEngineChainInput {
  static lc_name() {
    return 'ChatEngineChain';
  }

  /**
   * Static method to create a new ChatEngineChain from a
   * BaseLanguageModel and a BaseRetriever.
   * @param retriever {@link BaseRetriever} instance used to retrieve relevant documents.
   * @param options.returnSourceDocuments Whether to return source documents in the final output
   * @param options.condenseQuestionChain Options to initialize the standalone question generation chain used as the first internal step
   * @param options.qaChain {@link QAChainParams} used to initialize the QA chain used as the second internal step
   * @returns A new instance of ChatEngineChain.
   */
  static from(options: ChatEngineChainFromInput): ChatEngineChain {
    const {
      qaChain: qaChainOptions,
      classifyChain: classifyOptions,
      condenseQuestionChain: condenseQuestionChainOptions,
      verbose,
      ...rest
    } = options;

    if (qaChainOptions.type !== 'stuff') {
      throw new Error(`ChatEngineChain only supports 'stuff' qa chain for now: found ${qaChainOptions.type}`);
    }

    // use custom loader to extend how input documents from retrieval are propagated
    const qaChain = loadQAStuffChain(qaChainOptions, verbose);

    const classifyChain =
      classifyOptions &&
      new LLMChain({
        verbose,
        ...classifyOptions,
        outputKey: 'classification',
        // classify chain must return parsable JSON
        outputParser: new PojoOutputParser<any>(),
        callbacks: [
          {
            handleLLMStart: () => {},
          },
        ],
      });

    const condenseQuestionChain = new LLMChain({
      verbose,
      ...condenseQuestionChainOptions,
    });

    const instance = new this({
      classifyChain,
      qaChain,
      condenseQuestionChain,
      verbose,
      ...rest,
    });
    return instance;
  }

  inputKey = 'question';
  classificationKey = 'classification';
  chatHistoryKey = 'chat_history';

  get inputKeys() {
    return [this.inputKey, this.chatHistoryKey];
  }

  get outputKeys() {
    return this.qaChain.outputKeys.concat(this.returnSourceDocuments ? ['sourceDocuments'] : []);
  }

  get traceData(): any {
    return this._traceData;
  }

  retriever: BaseRetriever;
  classifyChain?: LLMChain;
  qaChain: BaseChain;
  condenseQuestionChain: LLMChain;

  returnSourceDocuments = false;

  engineCallbacks?: ChatEngineCallbacks | undefined;
  useStreaming?: boolean;
  protected _traceData?: any;

  constructor(fields: ChatEngineChainInput) {
    super(fields);
    this.retriever = fields.retriever;
    this.classifyChain = fields.classifyChain;
    this.qaChain = fields.qaChain;
    this.condenseQuestionChain = fields.condenseQuestionChain;
    this.inputKey = fields.inputKey ?? this.inputKey;
    this.returnSourceDocuments = fields.returnSourceDocuments ?? this.returnSourceDocuments;

    this.engineCallbacks = fields.engineCallbacks;
    this.useStreaming = fields.useStreaming ?? false;
  }

  /** @ignore */
  async _call(values: ChainValues, runManager?: CallbackManagerForChainRun): Promise<ChainValues> {
    if (!(this.inputKey in values)) {
      throw new Error(`Question key ${this.inputKey} not found.`);
    }
    if (!(this.chatHistoryKey in values)) {
      throw new Error(`Chat history key ${this.chatHistoryKey} not found.`);
    }
    const question: string = values[this.inputKey];
    const chatHistory = values[this.chatHistoryKey] || [];

    let classification: ChainValues | undefined;
    if (this.classifyChain) {
      logger.debug('Calling classify chain: ', { question });
      const $$ClassifyChainExecutionTime = startPerfMetric('Chain.CLASSIFY.ExecutionTime', {
        highResolution: true,
      });
      this.updateStatusCallback({
        operation: ChainOperation.CLASSIFY,
        status: ChainLLMCallStatus.STARTING,
        payload: {
          message: `Calling classify chain with question "${question}"`,
        },
      });
      classification = (await this.classifyChain.call({ question }))[this.classificationKey];
      const chainExecTime = $$ClassifyChainExecutionTime();

      this.updateStatusCallback({
        operation: ChainOperation.CLASSIFY,
        status: ChainLLMCallStatus.SUCCESS,
        payload: {
          message: `Classify chain execution finished`,
          executionTime: chainExecTime,
        },
      });
      logger.debug('Result from classify chain: ', { classification, chainExecTime });
    }

    let newQuestion = classification?.question || question;
    const hasHistory = chatHistory.length > 0;
    if (hasHistory) {
      const condenseQuestionInput: ChainValues = {
        question: newQuestion,
        ...classification,
        chat_history: chatHistory,
      };
      logger.debug('Chain:condenseQuestionChain:input', { input: condenseQuestionInput });
      const $$QuestionGeneratorExecutionTime = startPerfMetric('Chain.CONDENSE_QUESTION.ExecutionTime', {
        highResolution: true,
      });
      this.updateStatusCallback({
        operation: ChainOperation.CONDENSE_QUESTION,
        status: ChainLLMCallStatus.STARTING,
        payload: {
          message: `Calling condense question chain with ${chatHistory.length} history items`,
        },
      });
      const result = await this.condenseQuestionChain.call(
        condenseQuestionInput,
        runManager?.getChild('question_generator'),
      );
      const questionGeneratorExecTime = $$QuestionGeneratorExecutionTime();
      this.updateStatusCallback({
        operation: ChainOperation.CONDENSE_QUESTION,
        status: ChainLLMCallStatus.SUCCESS,
        payload: {
          message: `Condense question chain execution finished`,
          executionTime: questionGeneratorExecTime,
        },
      });
      logger.debug('Chain:condenseQuestionChain:output', { output: result, questionGeneratorExecTime });

      const keys = Object.keys(result);
      if (keys.length === 1) {
        newQuestion = result[keys[0]];
        logger.debug(`Rewrote question from "${question}" to "${newQuestion}`);
      } else {
        throw new Error('Return from llm chain has multiple values, only single values supported.');
      }
    }

    logger.debug('Chain:retriever:getRelevantDocuments:query', { query: newQuestion });
    const $$GetRelevantDocumentsExecutionTime = startPerfMetric('Chain.DocumentRetrieval.ExecutionTime', {
      highResolution: true,
    });
    this.updateStatusCallback({
      operation: ChainOperation.DOCUMENT_RETRIEVE,
      status: ChainLLMCallStatus.STARTING,
      payload: {
        message: `Calling document retrieve step with question "${newQuestion}"`,
      },
    });
    const docs = await this.retriever.getRelevantDocuments(newQuestion, runManager?.getChild('retriever'));
    const docRetrievalExecTime = $$GetRelevantDocumentsExecutionTime();
    this.updateStatusCallback({
      operation: ChainOperation.DOCUMENT_RETRIEVE,
      status: ChainLLMCallStatus.SUCCESS,
      payload: {
        message: `Document retrieval finished`,
        executionTime: docRetrievalExecTime,
      },
    });

    const inputs = {
      ...classification,
      input_documents: docs,
      chat_history: chatHistory,
      question: newQuestion,
    };

    logger.debug('Chain:qaChain:input', { input: inputs });
    const $$CombineDocumentsExecutionTime = startPerfMetric('Chain.QA.ExecutionTime', {
      highResolution: true,
    });
    this.updateStatusCallback({
      operation: ChainOperation.QA,
      status: ChainLLMCallStatus.STARTING,
      payload: {
        message: `Calling QA chain with ${inputs.input_documents.length} documents`,
      },
    });

    let streamedResult: string = '';
    let result;
    if (this.useStreaming) {
      const combineDocsRunManager = runManager?.getChild('combine_documents');
      logger.debug('Chain:qaChain:streaming', { useStreaming: this.useStreaming, combineDocsRunManager });

      // * this may need to be replaced depending on the actual model used to enable streaming
      //   * seems that generic approach will result in only one chunk (the whole response) instead of incremental response
      //   * this is with langchain@0.0.194 -- there were huge changes since so this issue may be solved - needs to be tested
      //   * you'll need to look into how you instantiate `this.qaChain`
      const stream = await this.qaChain.stream(inputs, combineDocsRunManager);

      for await (const chunk of stream) {
        streamedResult += chunk.text;
        this.streamCallback(chunk.text);
      }

      result = { text: streamedResult };
    } else {
      result = await this.qaChain.call(inputs, runManager?.getChild('combine_documents'));
    }

    const qaChainExecTime = $$CombineDocumentsExecutionTime();
    this.updateStatusCallback({
      operation: ChainOperation.QA,
      status: ChainLLMCallStatus.SUCCESS,
      payload: {
        message: `QA chain execution finished`,
        executionTime: qaChainExecTime,
      },
    });
    logger.debug('Chain:qaChain:output', { output: result });

    this._traceData = {
      originalQuestion: question,
      standaloneQuestion: newQuestion,
      classification,
      hasHistory,
      chainValues: values,
      chatHistory,
      sourceDocuments: docs,
      inputs,
      result,
      chains: {
        qaChain: this.qaChain instanceof StuffDocumentsChain ? this.qaChain.llmChain.toJSON() : this.qaChain.toJSON(),
        condenseQuestionChain: this.condenseQuestionChain.toJSON(),
        classifyChain: this.classifyChain && this.classifyChain.toJSON(),
      },
    };

    logger.debug('Trace data', { traceData: this.traceData });

    if (this.returnSourceDocuments) {
      return {
        ...result,
        sourceDocuments: docs,
      };
    }
    return result;
  }

  _chainType(): string {
    return 'conversational_retrieval_chain';
  }

  private updateStatusCallback(options: UpdateStatusCallbackOptions): void {
    if (this.engineCallbacks != null) {
      this.engineCallbacks.updateStatus(options);
    }
  }

  private streamCallback(newChunk: string): void {
    if (this.engineCallbacks != null) {
      this.engineCallbacks.streamChunks([newChunk]);
    }
  }
}

export function loadQAStuffChain(
  config: ResolvedLLMChainConfig,
  verbose: boolean = false,
  useStreaming: boolean = false,
) {
  const { llm, prompt } = config;

  // TODO: review if streaming section is valid
  const llmChain = new LLMChain({ prompt, llm, verbose, llmKwargs: { metadata: { streaming: useStreaming } } });
  const chain = new CustomStuffDocumentsChain({ llmChain, verbose });
  return chain;
}

export class CustomStuffDocumentsChain extends StuffDocumentsChain {
  documentsVariableName = this.documentVariableName + '_documents';

  _prepInputs(values: ChainValues): ChainValues {
    return {
      // propagate the "input_documents" objects array to prompt for handlebars to control rendering
      [this.documentsVariableName]: values[this.inputKey],
      ...super._prepInputs(values),
    };
  }
}
