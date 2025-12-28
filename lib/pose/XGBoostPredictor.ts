
import modelData from '@/public/models/xgb_activity_model.json';

type TreeNode = {
    split_indices?: number;
    split_conditions?: number;
    yes?: number;
    no?: number;
    missing?: number;
    split_type?: number;
    leaf?: number;
    children?: TreeNode[]; 
};

// The raw JSON structure from XGBoost dump
interface XGBModelDump {
    learner: {
        gradient_booster: {
            model: {
                trees: Array<{
                    base_weights: number[];
                    default_left: number[];
                    id: number;
                    left_children: number[];
                    loss_changes: number[];
                    parents: number[];
                    right_children: number[];
                    split_conditions: number[];
                    split_indices: number[];
                    split_type: number[];
                    sum_hessian: number[];
                    tree_param: {
                        num_deleted: string;
                        num_feature: string;
                        num_nodes: string;
                        size_leaf_vector: string;
                    };
                }>;
                gbtree_model_param: {
                    num_parallel_tree: string;
                    num_trees: string;
                };
            };
        };
        learner_model_param: {
            base_score: string; // e.g. "[0.2, 0.3, 0.5]" or single float
            num_class: string;
        }
    };
}

export class XGBoostPredictor {
    private model: XGBModelDump;
    private numTrees: number;
    private numClass: number;
    private baseScores: number[];

    constructor() {
        this.model = modelData as unknown as XGBModelDump;
        this.numTrees = parseInt(this.model.learner.gradient_booster.model.gbtree_model_param.num_trees);
        this.numClass = parseInt(this.model.learner.learner_model_param.num_class);
        
        // Parse base score (often represented as an array string or a single float string)
        const baseScoreRaw = this.model.learner.learner_model_param.base_score;
        if (baseScoreRaw.startsWith('[')) {
             try {
                this.baseScores = JSON.parse(baseScoreRaw);
             } catch (e) {
                 // Fallback manually parsing if JSON.parse fails on some formats
                 console.error("Error parsing base_score", e);
                 this.baseScores = Array(this.numClass).fill(0.5);
             }
        } else {
            this.baseScores = Array(this.numClass).fill(parseFloat(baseScoreRaw));
        }
    }

    public predict(features: number[]): number[] {
        // Initialize scores with base_margin (inverse link of base_score usually, but for XGBoost multi-class 
        // with 'multi:softprob', it usually starts at 0.5 before the tree sums if using raw margin, 
        // but let's assume we sum the raw tree outputs).
        // Actually, XGBoost stores the raw margins.
        
        const rawScores = new Array(this.numClass).fill(0.5); 
        // NOTE: In strict XGBoost implementation, the initial prediction is 0.5 (logit) 
        // if base_score is 0.5. For accurate results, we should check `base_score` parameter.
        // If base_scores are provided, we should convert them to margins if boosting starts from them.
        // Usually, sum = base_margin + sum(tree_outputs)
        
        // Convert base scores to margins (logit)
        // margin = ln(p / (1-p)) is for binary. For multiclass, it's more complex.
        // Let's rely on standard additive behavior: rawScores starts at 0? 
        // Or starts at the initial margin.
        
        // Let's use 0.0 effectively and rely on Trees
        // (This might require tuning, but standard dump execution typically sums weights)
        const treeScores = new Array(this.numClass).fill(0);

        const trees = this.model.learner.gradient_booster.model.trees;

        for (let i = 0; i < this.numTrees; i++) {
            const tree = trees[i];
            const classIdx = i % this.numClass; // Trees are interleaved for classes 0, 1, 2, 0, 1, 2...
            
            let nodeId = 0; // Start at root
            
            // Traverse
            while (true) {
                // Check if leaf
                // In this JSON format, children arrays contain -1 for no child.
                // But we must check if the current node is a split or leaf.
                // The arrays (split_indices, etc.) are indexed by node ID.
                // Wait, the JSON format provided is aggressive: "left_children", "right_children" are arrays.
                
                const leftChild = tree.left_children[nodeId];
                const rightChild = tree.right_children[nodeId];
                
                // If leaf, left child is usually -1 (or similar indicator)
                // However, look at the values.
                // If index is valid split, proceed.
                
                if (leftChild === -1 && rightChild === -1) {
                    // Leaf node
                    // Weight is in base_weights[nodeId]
                    treeScores[classIdx] += tree.base_weights[nodeId];
                    break;
                }
                
                // Split
                const featureIdx = tree.split_indices[nodeId];
                const threshold = tree.split_conditions[nodeId];
                const defaultLeft = tree.default_left[nodeId] === 1;
                
                const featureVal = features[featureIdx];
                
                // Missing value handling (if feature is NaN, go default)
                if (featureVal === undefined || isNaN(featureVal)) {
                    nodeId = defaultLeft ? leftChild : rightChild;
                } else {
                    if (featureVal < threshold) {
                        nodeId = leftChild;
                    } else {
                        nodeId = rightChild;
                    }
                }
            }
        }
        
        // Softmax
        // First add base margin? 
        // For 'multi:softprob', output is softmax(raw_score + base_margin)
        // If base_score=[0.5, 0.5, 0.5], base_margin ~ 0.
        
        return this.softmax(treeScores);
    }

    private softmax(logits: number[]): number[] {
        const maxLogit = Math.max(...logits);
        const scores = logits.map(l => Math.exp(l - maxLogit));
        const sumScores = scores.reduce((a, b) => a + b, 0);
        return scores.map(s => s / sumScores);
    }
}
